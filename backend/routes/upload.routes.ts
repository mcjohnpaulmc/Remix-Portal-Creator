/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import path from "path";
import { Router } from "express";
import multer from "multer";
import { requireAdminAuth } from "../auth";
import { s3PutUpload, s3GetUpload } from "../storage/s3";

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

// File upload endpoint (admin only) — stored in S3, never on disk
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
    await s3PutUpload(portalSlug, filename, req.file.buffer, req.file.mimetype);
  } catch {
    return res.status(500).json({ error: "Upload to S3 failed." });
  }

  const url = `/api/download/${encodeURIComponent(portalSlug)}/${encodeURIComponent(filename)}`;
  res.json({
    url,
    filename,
    originalName: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype,
  });
});

// File download — streams from S3 (no auth; images are displayed in portal <img> tags)
router.get("/api/download/:slug/:filename", async (req, res) => {
  const slug = req.params.slug.replace(/[^a-z0-9_-]/gi, "");
  const filename = path.basename(req.params.filename);
  if (!slug || !filename) {
    return res.status(400).json({ error: "Invalid path." });
  }

  const result = await s3GetUpload(slug, filename);
  if (!result) {
    return res.status(404).json({ error: "File not found." });
  }

  res.setHeader("X-Content-Type-Options", "nosniff");
  if (result.contentType) res.setHeader("Content-Type", result.contentType);
  (result.body as any).pipe(res);
});

export default router;
