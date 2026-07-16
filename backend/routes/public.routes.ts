/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { PortalUser, UserLog } from "../../shared/types";
import { readDatabase, writeDatabase } from "../storage/db";

const router = Router();

const LOG_RATE_LIMIT = 30;   // max entries per IP per window
const LOG_WINDOW_MS  = 60 * 1000;  // 1 minute
const MAX_LOG_ENTRIES = 1000; // hard cap on total stored log entries

const logLimiter = rateLimit({
  windowMs: LOG_WINDOW_MS,
  max: LOG_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many log requests." },
});

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

// POST /api/log — client-side analytics logging (rate-limited, capped)
router.post("/api/log", logLimiter, (req, res) => {
  const { email, action, details, subdomain } = req.body;

  // Validate field lengths to prevent log injection / unbounded growth
  const safeEmail     = String(email     || "anonymous-viewer").slice(0, 254);
  const safeAction    = String(action    || "Page View").slice(0, 128);
  const safeDetails   = String(details   || "").slice(0, 512);
  const safeSubdomain = subdomain ? String(subdomain).slice(0, 64) : undefined;

  const db = readDatabase();

  const newLog: UserLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    email: safeEmail,
    action: safeAction,
    details: safeDetails,
    date: new Date().toISOString(),
    ...(safeSubdomain ? { subdomain: safeSubdomain } : {}),
  };

  db.userLogs.unshift(newLog);
  // Trim to hard cap so spammers can't grow the JSON store unboundedly
  if (db.userLogs.length > MAX_LOG_ENTRIES) {
    db.userLogs = db.userLogs.slice(0, MAX_LOG_ENTRIES);
  }
  writeDatabase(db);
  res.json({ success: true });
});

export default router;
