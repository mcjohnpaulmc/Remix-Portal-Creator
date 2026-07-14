/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from "express";
import { PortalUser, UserLog } from "../../shared/types";
import { readDatabase, writeDatabase } from "../storage/db";

const router = Router();

// GET /api/database — strips passwordHash from users before sending to frontend
router.get("/api/database", (_req, res) => {
  const db = readDatabase();
  const safeUsers: PortalUser[] = (db.users || []).map(({ passwordHash: _ph, ...safe }) => safe);
  res.json({ ...db, users: safeUsers });
});

// GET /api/portal-info — hub identity endpoint
router.get("/api/portal-info", (_req, res) => {
  res.json({ isHub: true });
});

// POST /api/log — client-side analytics logging
router.post("/api/log", (req, res) => {
  const { email, action, details } = req.body;
  const db = readDatabase();

  const newLog: UserLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    email: email || "anonymous-viewer",
    action: action || "Page View",
    details: details || "Viewed specific item.",
    date: new Date().toISOString()
  };

  db.userLogs.unshift(newLog);
  writeDatabase(db);
  res.json({ success: true });
});

export default router;
