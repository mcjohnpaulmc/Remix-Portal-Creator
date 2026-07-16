/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from "express";
import { S3_BUCKET, S3_PREFIX } from "../config";
import { readDatabase, writeDatabase } from "../storage/db";
import { deployPortalInProcess } from "../portal/deploy";
import { logger } from "../logger";

const router = Router();

// POST /deploy — mounted at /api/admin, full path is /api/admin/deploy
router.post("/deploy", async (req, res) => {
  const { portalSlug } = req.body;
  if (!portalSlug) return res.status(400).json({ error: "portalSlug required." });

  const cleanSlug = portalSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");

  const db = readDatabase();
  const { localWriteOk, s3Ok, reloadOk } = await deployPortalInProcess(cleanSlug, db);

  const deployedAt = new Date().toISOString();
  const portalDir = `data/portals/${cleanSlug}`;
  const s3Path = `s3://${S3_BUCKET}/${S3_PREFIX}/${cleanSlug}/portal.json`;
  const s3Status = s3Ok ? "ok" : "S3 upload failed";

  if (!localWriteOk) {
    logger.error("Deploy", `Local write failed for ${cleanSlug}`);
    db.userLogs.unshift({
      id: `log-${Date.now()}`,
      email: (req as any).adminEmail || "admin@mobiusservices.co.in",
      action: "Portal Deploy Failed",
      details: `Failed to write portal.json for ${cleanSlug}. S3: ${s3Status}`,
      date: deployedAt,
    });
    writeDatabase(db);
    return res.status(500).json({
      success: false,
      localWriteOk,
      s3Ok,
      reloadOk,
      error: `Failed to write portal.json for ${cleanSlug}`,
    });
  }

  if (!s3Ok) {
    logger.error("S3", `Deploy upload failed for ${cleanSlug}`);
  }

  db.userLogs.unshift({
    id: `log-${Date.now()}`,
    email: "admin@mobiusservices.co.in",
    action: "Portal Deployed",
    details: `Deployed ${cleanSlug} to S3 (${s3Path}). S3: ${s3Status}`,
    date: deployedAt,
  });
  writeDatabase(db);

  res.json({
    success: true,
    localWriteOk,
    s3Ok,
    reloadOk,
    deployedAt,
    portalDir,
    s3Path,
    s3Status,
  });
});

export default router;
