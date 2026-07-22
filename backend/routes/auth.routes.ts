/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getUsersCache, setUsersCache, verifyPassword, issueJwt } from "../auth";
import { readDatabase, writeDatabase, InternalUser } from "../storage/db";
import { s3SyncUsers } from "../storage/s3";

const router = Router();

const IS_PROD = process.env.NODE_ENV === "production";

// 12 hours in seconds
const SESSION_MAX_AGE = 12 * 60 * 60;

function setSessionCookie(res: any, token: string): void {
  res.cookie("mobius_token", token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "strict" as const,
    maxAge: SESSION_MAX_AGE * 1000,
    path: "/",
  });
}

function clearSessionCookie(res: any): void {
  res.cookie("mobius_token", "", {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "strict" as const,
    maxAge: 0,
    path: "/",
  });
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
});

// POST /api/login — validates email + password, issues JWT as an HttpOnly cookie
router.post("/api/login", loginLimiter, (req, res) => {
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

  // Issue JWT for all users and deliver it as an HttpOnly cookie.
  // The token field in the body is kept for backward compatibility (scripts/Postman)
  // but browsers should rely on the cookie going forward.
  const sessionToken = issueJwt(normalized, user.role);
  setSessionCookie(res, sessionToken);

  res.json({ success: true, email: normalized, name: user.name, role: user.role, token: sessionToken });
});

// POST /api/logout — clears the session cookie
router.post("/api/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ success: true });
});

// POST /api/email-login — kept for backward compatibility
router.post("/api/email-login", (_req, res) => {
  res.status(410).json({ error: "Please use email and password to login." });
});

export default router;
