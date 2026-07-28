/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from "express";
import { Solution, Collateral } from "../../shared/types";
import { readDatabase, writeDatabase } from "../storage/db";
import { s3PutUpload } from "../storage/s3";
import { autoDeployLivePortals } from "../portal/deploy";
import { buildAdminSafeDbView } from "../utils/dbView";
import { logger } from "../logger";

const router = Router();

const PORTALS = {
  mobius: "http://127.0.0.1:4000",
  techmobius: "http://127.0.0.1:8082",
} as const;

type PortalKey = keyof typeof PORTALS;

interface ExternalSolution {
  id: string;
  title: string;
  targetUrl: string;
  thumbnailUrl: string;
  practice: string;
  solutionType: string;
  credentialsNote: string;
  defaultUsername: string;
  collateralCount: number;
}

// Fetches the raw, unmapped solution + collateral records from a source portal.
// Kept separate from the "shape for the browser" mapping below so both the
// preview listing and the actual import share one source of truth for what
// the external API returned.
async function fetchRawPortalData(key: PortalKey): Promise<{ solutions: any[]; collaterals: any[] }> {
  const base = PORTALS[key];
  try {
    const [solRes, colRes] = await Promise.all([
      fetch(`${base}/api/solutions`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${base}/api/collaterals`, { signal: AbortSignal.timeout(5000) }),
    ]);
    if (!solRes.ok) return { solutions: [], collaterals: [] };
    const solutions: any[] = await solRes.json();
    const collaterals: any[] = colRes.ok ? await colRes.json() : [];
    return { solutions, collaterals };
  } catch (err: any) {
    logger.warn(`external-portals`, `${key} unreachable: ${err?.message}`);
    return { solutions: [], collaterals: [] };
  }
}

async function fetchPortalData(key: PortalKey): Promise<ExternalSolution[]> {
  const { solutions, collaterals } = await fetchRawPortalData(key);

  // Build collateral count map keyed by linked_solution_id
  const countMap: Record<string, number> = {};
  for (const c of collaterals) {
    const sid = c.linked_solution_id;
    if (sid) countMap[sid] = (countMap[sid] || 0) + 1;
  }

  return solutions.map((s: any) => ({
    id: s.id,
    title: s.title || "",
    targetUrl: s.target_url || "",
    thumbnailUrl: s.thumbnail_url || "",
    practice: s.practice || "",
    solutionType: s.solution_type || "",
    credentialsNote: s.credentials_note || "",
    defaultUsername: s.default_username || "",
    collateralCount: countMap[s.id] || 0,
  }));
}

// GET /external-portals/solutions — admin-gated (mounted under /api/admin in server.ts)
router.get("/external-portals/solutions", async (_req, res) => {
  const [mobius, techmobius] = await Promise.all([
    fetchPortalData("mobius"),
    fetchPortalData("techmobius"),
  ]);
  res.json({ mobius, techmobius });
});

// Downloads an image from the source portal and re-hosts it in our own S3 uploads
// bucket, returning a hub-served /api/download URL. This is deliberately NOT just
// "use the URL as-is": thumbnail_url is frequently a relative path (e.g.
// "/uploads/x.png") or an http:// loopback address (PORTALS above are internal
// 127.0.0.1 addresses) that only the HUB SERVER can reach — the admin's own
// browser cannot load either of those directly. The hub can reach the source
// portal (it already does, to fetch /api/solutions), so it downloads the bytes
// itself and serves them from a URL that works for any browser, on any network.
async function rehostImage(base: string, rawUrl: string): Promise<string> {
  if (!rawUrl) return "";
  const absoluteUrl = /^https?:\/\//i.test(rawUrl)
    ? rawUrl
    : `${base}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;

  try {
    const resp = await fetch(absoluteUrl, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return "";
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return "";

    const buf = Buffer.from(await resp.arrayBuffer());
    const ext = contentType.split("/")[1]?.split(";")[0]?.replace(/[^a-z0-9]/gi, "") || "png";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await s3PutUpload("imports", filename, buf, contentType);
    return `/api/download/imports/${encodeURIComponent(filename)}`;
  } catch (err: any) {
    logger.warn("external-portals", `Thumbnail re-host failed for ${absoluteUrl}: ${err?.message}`);
    return "";
  }
}

// POST /external-portals/import — imports selected solutions AND every collateral
// linked to them (by linked_solution_id) from a source portal, re-hosting
// thumbnails so they actually render for the browser.
router.post("/external-portals/import", async (req, res) => {
  const { portal, solutionIds, customerNames } = req.body as {
    portal?: PortalKey;
    solutionIds?: string[];
    customerNames?: string[];
  };

  if (!portal || !PORTALS[portal]) {
    return res.status(400).json({ error: "A valid portal ('mobius' or 'techmobius') is required." });
  }
  if (!Array.isArray(solutionIds) || solutionIds.length === 0) {
    return res.status(400).json({ error: "At least one solutionId is required." });
  }

  const adminEmail = (req as any).adminEmail;
  const targetCustomerNames = Array.isArray(customerNames) && customerNames.length > 0 ? customerNames : ["all"];
  const base = PORTALS[portal];

  const { solutions: rawSolutions, collaterals: rawCollaterals } = await fetchRawPortalData(portal);
  if (rawSolutions.length === 0) {
    return res.status(502).json({ error: `Could not reach ${portal} or it returned no solutions.` });
  }

  const db = readDatabase();
  if (!db.collaterals) db.collaterals = [];
  const existingTitles = new Set((db.solutions || []).map(s => s.title.toLowerCase().trim()));

  let importedSolutions = 0;
  let importedCollaterals = 0;
  let skippedSolutions = 0;

  for (const extId of solutionIds) {
    const s = rawSolutions.find((x: any) => x.id === extId);
    if (!s) continue;

    const title: string = s.title || "";
    if (!title || existingTitles.has(title.toLowerCase().trim())) {
      skippedSolutions++;
      continue;
    }

    const tags: string[] = [];
    if (s.practice) tags.push(s.practice);
    if (s.solution_type) tags.push(s.solution_type);

    const thumbnail = await rehostImage(base, s.thumbnail_url || "");

    const newSol: Solution = {
      id: `sol-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      thumbnail,
      url: s.target_url || "",
      credentialsDescription: s.credentials_note || "",
      usernamePrefill: s.default_username || "",
      passwordPrefill: "",
      tags,
      createdAt: new Date().toISOString(),
      enabled: true,
      customerName: targetCustomerNames[0],
      customerNames: targetCustomerNames,
      createdBy: adminEmail || undefined,
    };
    db.solutions.unshift(newSol);
    existingTitles.add(title.toLowerCase().trim());
    importedSolutions++;

    const linkedCollaterals = rawCollaterals.filter((c: any) => c.linked_solution_id === extId);
    for (const c of linkedCollaterals) {
      const colThumbnail = await rehostImage(base, c.thumbnail_url || "");
      const newCol: Collateral = {
        id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: c.title || title,
        thumbnail: colThumbnail,
        prompt: c.prompt || "",
        generatedContent: c.generated_content || c.content || c.description || "",
        uploadedFiles: [],
        createdAt: new Date().toISOString(),
        enabled: true,
        customerName: targetCustomerNames[0],
        customerNames: targetCustomerNames,
        googleDriveUrl: c.google_drive_url || c.drive_url || "",
        tag: c.tag || c.category || undefined,
        fileType: c.file_type || undefined,
        createdBy: adminEmail || undefined,
      };
      db.collaterals.unshift(newCol);
      importedCollaterals++;
    }

    db.userLogs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      email: adminEmail || "admin@mobiusservices.co.in",
      action: "Solution Imported",
      details: `Imported "${title}" from ${portal} with ${linkedCollaterals.length} linked collateral(s).`,
      date: new Date().toISOString(),
    });
  }

  writeDatabase(db);
  await autoDeployLivePortals(db);

  res.json({
    success: true,
    importedSolutions,
    importedCollaterals,
    skippedSolutions,
    database: buildAdminSafeDbView(db, adminEmail),
  });
});

export default router;
