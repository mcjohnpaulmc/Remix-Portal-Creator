/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import path from "path";
import { Router } from "express";
import multer from "multer";
import { requireAdminAuth } from "../auth";
import { putUpload, getUpload } from "../storage/uploads";
import { resolveHubOrigin } from "../utils/hubOrigin";

const router = Router();

// Extensions that can execute in a browser and enable stored XSS
const BLOCKED_EXTENSIONS = new Set([
  ".html", ".htm", ".svg", ".js", ".mjs", ".cjs", ".jsx",
  ".ts", ".tsx", ".php", ".asp", ".aspx", ".exe", ".bat",
  ".cmd", ".ps1", ".sh", ".xml", ".xhtml",
]);

// Multer — memory storage only; files are never written to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) {
      return cb(new Error(`File type ${ext} is not allowed.`));
    }
    cb(null, true);
  },
});

// File upload endpoint (admin only) — stored via putUpload (S3 by default, or
// local disk under data/uploads when UPLOAD_STORAGE_MODE=local — see config.ts)
router.post("/api/upload", requireAdminAuth, (req: any, res: any, next: any) => {
  upload.single("file")(req, res, (err: any) => {
    if (err) return res.status(400).json({ error: err.message || "Upload failed." });
    next();
  });
}, async (req: any, res: any) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file received." });
  }
  const portalSlug = ((req.query.portalSlug as string) || "global").replace(/[^a-z0-9_-]/gi, "") || "global";
  const safe = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${Date.now()}-${safe}`;

  try {
    await putUpload(portalSlug, filename, req.file.buffer, req.file.mimetype);
  } catch {
    return res.status(500).json({ error: "Upload failed." });
  }

  // Absolute, not relative: this URL is embedded in solution/collateral thumbnails
  // that render on customer-portal subdomains, which are served by an entirely
  // separate portal-server.ts process with no /api/download route of its own — a
  // relative path would resolve against that portal's own origin and 404 there,
  // even though it works fine when viewed from the hub's own admin console.
  const url = `${resolveHubOrigin(req)}/api/download/${encodeURIComponent(portalSlug)}/${encodeURIComponent(filename)}`;
  res.json({
    url,
    filename,
    originalName: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype,
  });
});

// File download — streams from S3 or local disk, whichever has it (no auth; images
// are displayed in portal <img> tags)
router.get("/api/download/:slug/:filename", async (req, res) => {
  const slug = req.params.slug.replace(/[^a-z0-9_-]/gi, "");
  const filename = path.basename(req.params.filename);
  if (!slug || !filename) {
    return res.status(400).json({ error: "Invalid path." });
  }

  const result = await getUpload(slug, filename);
  if (!result) {
    return res.status(404).json({ error: "File not found." });
  }

  res.setHeader("X-Content-Type-Options", "nosniff");
  if (result.contentType) res.setHeader("Content-Type", result.contentType);
  (result.body as any).pipe(res);
});

export default router;
