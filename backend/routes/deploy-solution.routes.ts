/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "fs";
import path from "path";
import { Router } from "express";
import multer from "multer";
import { Solution } from "../../shared/types";
import { DEPLOYED_SOLUTIONS_DIR } from "../config";
import { readDatabase, writeDatabase } from "../storage/db";
import { autoDeployLivePortals } from "../portal/deploy";
import { ensureDnsRecord } from "../dns/cloudflare";
import { ensureStaticHtmlIisSite } from "../iis/site";
import { buildAdminSafeDbView } from "../utils/dbView";
import { isSuperAdminRole } from "../auth";
import { logger } from "../logger";

const router = Router();

// Memory storage only — the file is written to DEPLOYED_SOLUTIONS_DIR explicitly
// below, never persisted by multer itself.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // This endpoint is the deliberate, narrow exception to the app-wide
    // "never accept uploaded HTML" rule (see upload.routes.ts BLOCKED_EXTENSIONS):
    // the file is served from its own dedicated subdomain, a different browser
    // origin from the hub — its cookies (see auth.routes.ts setSessionCookie,
    // which sets no Domain attribute) are never exposed to it, so embedded
    // script in the uploaded HTML cannot read the hub's session.
    if (ext !== ".html" && ext !== ".htm") {
      return cb(new Error("Only .html/.htm files are accepted."));
    }
    cb(null, true);
  },
});

// POST /deploy-solution — mounted at /api/admin, full path /api/admin/deploy-solution
router.post("/deploy-solution", (req: any, res: any, next: any) => {
  upload.single("file")(req, res, (err: any) => {
    if (err) return res.status(400).json({ error: err.message || "Upload failed." });
    next();
  });
}, async (req: any, res: any) => {
  const adminEmail = (req as any).adminEmail;
  const isSuperAdmin = isSuperAdminRole((req as any).userRole);

  if (!req.file) {
    return res.status(400).json({ error: "An HTML file is required." });
  }

  const title = String(req.body.title || "").trim();
  const rawSlug = String(req.body.subdomain || "").trim();
  const domain = "mobiusservices.io";
  let customerNames: string[];
  try {
    customerNames = JSON.parse(req.body.customerNames || "[]");
    if (!Array.isArray(customerNames)) throw new Error();
  } catch {
    return res.status(400).json({ error: "customerNames must be a JSON array." });
  }

  if (!title) return res.status(400).json({ error: "Title is required." });
  // No target-portal requirement — an empty selection is valid and mirrors the
  // manual onboarding form: the deployed app lands in the Hub Repository only,
  // unmapped to any portal, until mapped later from the Map Solutions page.

  const db = readDatabase();

  // Subdomain is optional — when left blank, derive a slug from the title so
  // the admin isn't forced to hand-pick one just to deploy.
  const explicitSlug = rawSlug.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const titleSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  let cleanSlug = explicitSlug || titleSlug;
  if (!cleanSlug) return res.status(400).json({ error: "Could not derive a subdomain from the title — please enter one manually." });

  // The subdomain namespace is shared with customer portals — a deployed HTML
  // solution and a portal can't collide on the same slug.
  const taken = (slug: string) =>
    (db.subdomains || []).some(s => s.name === slug) || (db.solutions || []).some(s => s.deployedSlug === slug);

  if (explicitSlug) {
    // Manually-typed slug — fail hard so the admin gets a clear, actionable error.
    if (taken(cleanSlug)) {
      return res.status(400).json({ error: `Subdomain "${cleanSlug}.${domain}" is already in use.` });
    }
  } else {
    // Auto-derived from the title — disambiguate with a numeric suffix instead
    // of failing outright.
    let candidate = cleanSlug;
    let suffix = 2;
    while (taken(candidate)) {
      candidate = `${cleanSlug}-${suffix++}`;
    }
    cleanSlug = candidate;
  }

  // Regular admins may only map to portals they own (or the legacy/no-owner
  // ones) — mirrors the ownership rule enforced everywhere else. Superadmins
  // and the "all" sentinel (already scoped per-owner at deploy time downstream
  // in buildPortalSnapshot) bypass this.
  if (!isSuperAdmin) {
    const ownPortalNames = new Set(
      (db.subdomains || []).filter(s => !s.createdBy || s.createdBy === adminEmail).map(s => s.name)
    );
    const disallowed = customerNames.filter(n => n !== "all" && !ownPortalNames.has(n));
    if (disallowed.length > 0) {
      return res.status(403).json({ error: `You do not have permission to map to: ${disallowed.join(", ")}` });
    }
  }

  const solutionDir = path.join(DEPLOYED_SOLUTIONS_DIR, cleanSlug);
  try {
    fs.mkdirSync(solutionDir, { recursive: true });
    fs.writeFileSync(path.join(solutionDir, "index.html"), req.file.buffer);
  } catch (err: any) {
    logger.error(`deploy-solution-${cleanSlug}`, `Failed to write index.html: ${err?.message}`);
    return res.status(500).json({ error: "Failed to store the uploaded file." });
  }

  const fqdn = `${cleanSlug}.${domain}`;
  const dnsOk = await ensureDnsRecord(cleanSlug, domain).catch(() => false);
  await ensureStaticHtmlIisSite(cleanSlug, fqdn, solutionDir).catch(err =>
    logger.error(`deploy-solution-${cleanSlug}`, `IIS site creation failed: ${err?.message}`)
  );

  const newSol: Solution = {
    id: `sol-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    thumbnail: "",
    url: `https://${fqdn}`,
    credentialsDescription: "",
    tags: [],
    createdAt: new Date().toISOString(),
    enabled: true,
    customerName: customerNames[0] || "",
    customerNames,
    deployedSlug: cleanSlug,
    deployedDomain: domain,
    createdBy: adminEmail || undefined,
  };
  db.solutions.unshift(newSol);
  db.userLogs.unshift({
    id: `log-${Date.now()}`,
    email: adminEmail || "admin@mobiusservices.co.in",
    action: "Standalone Solution Deployed",
    details: `Deployed HTML app "${title}" at ${fqdn}. DNS: ${dnsOk ? "active" : "pending"}.`,
    date: new Date().toISOString(),
  });

  writeDatabase(db);
  await autoDeployLivePortals(db);

  res.json({
    success: true,
    url: `https://${fqdn}`,
    dnsOk,
    solution: newSol,
    database: buildAdminSafeDbView(db, adminEmail, isSuperAdmin),
  });
});

export default router;
