/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from "express";
import { getUsersCache, setUsersCache, verifyPassword, issueJwt } from "../auth";
import { readDatabase, writeDatabase, InternalUser } from "../storage/db";
import { s3SyncUsers } from "../storage/s3";

const router = Router();

// POST /api/login — validates email + password against S3-sourced users cache
router.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const normalized = email.trim().toLowerCase();

  // Prefer in-memory S3 cache; fall back to local DB if cache not yet loaded
  const users: InternalUser[] = getUsersCache() ?? (readDatabase().users || []);
  const user = users.find(u => u.email === normalized && u.enabled !== false &&
    verifyPassword(password, u.passwordHash || "", (newHash) => {
      // Migrate legacy SHA-256 hash to bcrypt on first successful login
      u.passwordHash = newHash;
      const db = readDatabase();
      const idx = (db.users || []).findIndex((x: InternalUser) => x.email === normalized);
      if (idx !== -1) { db.users![idx].passwordHash = newHash; writeDatabase(db); }
      s3SyncUsers(db.users || []).catch(() => {});
    })
  );

  if (!user) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  // Log to local DB (non-blocking)
  const db = readDatabase();
  db.userLogs.unshift({
    id: `log-${Date.now()}`,
    email: normalized,
    action: "User Login",
    details: `User "${user.name}" (${user.role}) authenticated successfully.`,
    date: new Date().toISOString()
  });
  writeDatabase(db);

  // Issue a signed JWT for admin users so the frontend can make authenticated admin API calls
  const sessionToken = user.role === "admin"
    ? issueJwt(normalized, user.role)
    : undefined;

  res.json({ success: true, email: normalized, name: user.name, role: user.role, token: sessionToken });
});

// POST /api/email-login — kept for backward compatibility
router.post("/api/email-login", (_req, res) => {
  res.status(410).json({ error: "Please use email and password to login." });
});

export default router;
