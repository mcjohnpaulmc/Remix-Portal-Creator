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
import { isSuperAdminRole } from "../auth";
import { resolveHubOrigin } from "../utils/hubOrigin";
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

// Reads the first field present out of several candidate names — the exact field
// names used by the Mobius/Techmobius APIs for collateral resource links/kind
// aren't documented here, so several common REST naming conventions are tried
// rather than betting the whole import on one guess.
function pick(obj: any, keys: string[]): string {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return "";
}

function resolveUrl(base: string, rawUrl: string): string {
  if (!rawUrl) return "";
  return /^https?:\/\//i.test(rawUrl)
    ? rawUrl
    : `${base}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;
}

const LOOPBACK_RE = /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0|::1)/i;

// Identifies an image by its magic bytes rather than trusting the source's
// Content-Type header — many simple/internal file servers (exactly what
// PORTALS above are: 127.0.0.1 dev-style services) omit it or send a generic
// "application/octet-stream", which caused every thumbnail to be silently
// rejected under a strict `contentType.startsWith("image/")` check.
function sniffImageContentType(buf: Buffer): string | null {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 6 && (buf.toString("ascii", 0, 6) === "GIF87a" || buf.toString("ascii", 0, 6) === "GIF89a")) return "image/gif";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d) return "image/bmp";
  return null;
}

// Downloads an image from the source portal and re-hosts it in our own S3 uploads
// bucket, returning a hub-served /api/download URL — the hub can reach the source
// portal (it already does, to fetch /api/solutions), so it downloads the bytes
// itself rather than trusting the admin's browser to load a URL that may be a
// relative path or an internal 127.0.0.1 address it cannot reach.
async function rehostImage(absoluteUrl: string, hubOrigin: string): Promise<string> {
  try {
    const resp = await fetch(absoluteUrl, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) {
      logger.warn("external-portals", `Thumbnail fetch ${absoluteUrl} returned HTTP ${resp.status}`);
      return "";
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    const declaredType = (resp.headers.get("content-type") || "").split(";")[0].trim();
    const sniffed = sniffImageContentType(buf);
    const contentType = sniffed || (declaredType.startsWith("image/") ? declaredType : "");
    if (!contentType) {
      logger.warn(
        "external-portals",
        `${absoluteUrl} did not look like an image (declared type "${declaredType || "none"}", ${buf.length} bytes) — skipping re-host.`
      );
      return "";
    }
    const ext = contentType.split("/")[1] || "png";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await s3PutUpload("imports", filename, buf, contentType);
    // Absolute, not relative — this renders on customer-portal subdomains too,
    // which are served by a separate process with no /api/download route of
    // their own (see upload.routes.ts for the same fix and full rationale).
    return `${hubOrigin}/api/download/imports/${encodeURIComponent(filename)}`;
  } catch (err: any) {
    logger.warn("external-portals", `Thumbnail re-host failed for ${absoluteUrl}: ${err?.message}`);
    return "";
  }
}

// Resolves a thumbnail URL end to end: re-host it so it's guaranteed to render for
// any browser; if re-hosting fails for any reason (network hiccup, unusual
// response) but the original URL is a normal public address (not a 127.0.0.1
// loopback only the hub server can reach), fall back to using it directly rather
// than showing no thumbnail at all.
async function resolveThumbnail(base: string, rawUrl: string, hubOrigin: string): Promise<string> {
  if (!rawUrl) return "";
  const absoluteUrl = resolveUrl(base, rawUrl);
  const rehosted = await rehostImage(absoluteUrl, hubOrigin);
  if (rehosted) return rehosted;
  return LOOPBACK_RE.test(absoluteUrl) ? "" : absoluteUrl;
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
  const isSuperAdmin = isSuperAdminRole((req as any).userRole);
  const targetCustomerNames = Array.isArray(customerNames) && customerNames.length > 0 ? customerNames : ["all"];
  const base = PORTALS[portal];
  const hubOrigin = resolveHubOrigin(req);

  const { solutions: rawSolutions, collaterals: rawCollaterals } = await fetchRawPortalData(portal);
  if (rawSolutions.length === 0) {
    return res.status(502).json({ error: `Could not reach ${portal} or it returned no solutions.` });
  }

  const db = readDatabase();
  if (!db.collaterals) db.collaterals = [];
  const existingSolutionTitles = new Set((db.solutions || []).map(s => s.title.toLowerCase().trim()));
  const existingCollateralTitles = new Set((db.collaterals || []).map(c => c.title.toLowerCase().trim()));

  let importedSolutions = 0;
  let importedCollaterals = 0;
  let skippedSolutions = 0;
  let skippedCollaterals = 0;

  for (const extId of solutionIds) {
    const s = rawSolutions.find((x: any) => x.id === extId);
    if (!s) continue;

    const title: string = s.title || "";
    if (!title || existingSolutionTitles.has(title.toLowerCase().trim())) {
      skippedSolutions++;
      continue;
    }

    const tags: string[] = [];
    if (s.practice) tags.push(s.practice);
    if (s.solution_type) tags.push(s.solution_type);

    const thumbnail = await resolveThumbnail(base, s.thumbnail_url || "", hubOrigin);

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
    existingSolutionTitles.add(title.toLowerCase().trim());
    importedSolutions++;

    const linkedCollaterals = rawCollaterals.filter((c: any) => c.linked_solution_id === extId);
    for (const c of linkedCollaterals) {
      const colTitle: string = c.title || title;
      if (existingCollateralTitles.has(colTitle.toLowerCase().trim())) {
        skippedCollaterals++;
        continue;
      }

      // The source distinguishes different kinds of collateral (video, doc, pptx,
      // web article/source) — field names for the resource link and its kind
      // aren't documented, so several likely candidates are tried in order.
      const resourceUrl = resolveUrl(base, pick(c, [
        "resource_url", "file_url", "content_url", "video_url", "document_url",
        "article_url", "source_url", "link_url", "url", "link",
      ]));
      const kind = pick(c, ["type", "resource_type", "file_type", "kind", "category"]).toLowerCase();
      const driveUrl = pick(c, ["google_drive_url", "drive_url", "gdrive_url"]);

      const colThumbnail = await resolveThumbnail(base, c.thumbnail_url || "", hubOrigin);

      const newCol: Collateral = {
        id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: colTitle,
        thumbnail: colThumbnail,
        prompt: c.prompt || "",
        generatedContent: c.generated_content || c.content || c.description || "",
        uploadedFiles: resourceUrl && !driveUrl
          ? [{ name: colTitle, size: "", type: kind || "file", url: resourceUrl }]
          : [],
        createdAt: new Date().toISOString(),
        enabled: true,
        customerName: targetCustomerNames[0],
        customerNames: targetCustomerNames,
        googleDriveUrl: driveUrl,
        tag: c.tag || c.category || kind || undefined,
        fileType: c.file_type || kind || undefined,
        linkedSolutionId: newSol.id,
        createdBy: adminEmail || undefined,
      };
      db.collaterals.unshift(newCol);
      existingCollateralTitles.add(colTitle.toLowerCase().trim());
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
    skippedCollaterals,
    database: buildAdminSafeDbView(db, adminEmail, isSuperAdmin),
  });
});

export default router;
