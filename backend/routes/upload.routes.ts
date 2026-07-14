/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "fs";
import path from "path";
import express, { Router } from "express";
import multer from "multer";
import { UPLOADS_DIR } from "../config";
import { requireAdminAuth } from "../auth";

const router = Router();

// Extensions that can execute in a browser and enable stored XSS
const BLOCKED_EXTENSIONS = new Set([
  ".html", ".htm", ".svg", ".js", ".mjs", ".cjs", ".jsx",
  ".ts", ".tsx", ".php", ".asp", ".aspx", ".exe", ".bat",
  ".cmd", ".ps1", ".sh", ".xml", ".xhtml",
]);

// Multer — disk storage for uploaded files
const multerStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const slug = ((req.query.portalSlug as string) || "").replace(/[^a-z0-9_-]/gi, "");
    const dest = slug ? path.join(UPLOADS_DIR, slug) : UPLOADS_DIR;
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({
  storage: multerStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) {
      return cb(new Error(`File type ${ext} is not allowed.`));
    }
    cb(null, true);
  },
});

// Serve uploaded files as forced-download attachments to prevent stored XSS
router.use("/uploads", (req, res, next) => {
  res.setHeader("Content-Disposition", `attachment; filename="${path.basename(req.path)}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
}, express.static(UPLOADS_DIR));

// File upload endpoint (admin only)
router.post("/api/upload", requireAdminAuth, (req: any, res: any, next: any) => {
  upload.single("file")(req, res, (err: any) => {
    if (err) return res.status(400).json({ error: err.message || "Upload failed." });
    next();
  });
}, (req: any, res: any) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file received." });
  }
  const portalSlug = ((req.query.portalSlug as string) || "").replace(/[^a-z0-9_-]/gi, "");
  const subPath = portalSlug ? `${portalSlug}/` : "";
  const url = `/uploads/${subPath}${req.file.filename}`;
  res.json({
    url,
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype,
  });
});

// File download — serve real files from uploads/
router.get("/api/download/:filename", (req, res) => {
  const safeFilename = path.basename(req.params.filename);
  const portalSlug = ((req.query.portalSlug as string) || "").replace(/[^a-z0-9_-]/gi, "");
  const filePath = portalSlug
    ? path.join(UPLOADS_DIR, portalSlug, safeFilename)
    : path.join(UPLOADS_DIR, safeFilename);

  if (!filePath.startsWith(UPLOADS_DIR)) {
    return res.status(400).json({ error: "Invalid path." });
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found." });
  }
  res.download(filePath);
});

export default router;
