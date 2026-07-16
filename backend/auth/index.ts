/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import express from "express";
import { BCRYPT_ROUNDS, ADMIN_TOKEN, JWT_SECRET as CFG_JWT_SECRET, DATA_DIR } from "../config";
import { readDatabase, InternalUser } from "../storage/db";
import { logger } from "../logger";

// ── Password utilities ─────────────────────────────────────────────────────────

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, BCRYPT_ROUNDS);
}

/**
 * Verify password — accepts bcrypt hashes and migrates legacy SHA-256 hashes on the fly.
 * @param onMigrate called with the new bcrypt hash when a SHA-256 hash is successfully verified
 */
export function verifyPassword(
  plain: string,
  stored: string,
  onMigrate?: (newHash: string) => void
): boolean {
  if (stored.startsWith("$2")) {
    return bcrypt.compareSync(plain, stored);
  }
  // Legacy SHA-256 path — compare then migrate
  const sha256 = createHash("sha256").update(plain).digest("hex");
  if (sha256 === stored) {
    onMigrate?.(hashPassword(plain));
    return true;
  }
  return false;
}

// ── JWT secret ─────────────────────────────────────────────────────────────────
// Prefer JWT_SECRET from env (required for multi-machine clusters).
// If unset, derive a stable machine-local secret persisted in data/.jwt-secret
// so sessions survive server restarts on single-machine deployments.

let effectiveJwtSecret: string;
if (!CFG_JWT_SECRET) {
  const secretFile = path.join(DATA_DIR, ".jwt-secret");
  let stable: string;
  try {
    stable = fs.readFileSync(secretFile, "utf-8").trim();
    if (stable.length < 32) throw new Error("too short");
  } catch {
    stable = createHash("sha256").update(`jwt-${Math.random()}${Date.now()}`).digest("hex");
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(secretFile, stable, { mode: 0o600 });
    } catch { /* non-fatal — falls back to in-memory secret this boot */ }
  }
  effectiveJwtSecret = stable;
  logger.warn(
    "Auth",
    "JWT_SECRET env var not set — using persisted machine-local secret from data/.jwt-secret. Set JWT_SECRET in .env for multi-server deployments."
  );
} else {
  effectiveJwtSecret = CFG_JWT_SECRET;
}

let effectiveAdminToken: string;
if (!ADMIN_TOKEN) {
  effectiveAdminToken = createHash("sha256").update(`admin-${Math.random()}${Date.now()}`).digest("hex");
  logger.warn(
    "Auth",
    "ADMIN_TOKEN env var not set — using ephemeral random token for X-Admin-Token header. Set ADMIN_TOKEN in .env for server-to-server calls."
  );
} else {
  effectiveAdminToken = ADMIN_TOKEN;
}

// ── In-memory users cache ──────────────────────────────────────────────────────

let usersCache: InternalUser[] | null = null;

export function getUsersCache(): InternalUser[] | null {
  return usersCache;
}

export function setUsersCache(users: InternalUser[] | null): void {
  usersCache = users;
}

// ── JWT issue ─────────────────────────────────────────────────────────────────

export function issueJwt(email: string, role: string): string {
  return jwt.sign({ email, role }, effectiveJwtSecret, { expiresIn: "12h" });
}

// ── Admin auth middleware ──────────────────────────────────────────────────────

export function requireAdminAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  // Path 1: server-to-server ADMIN_TOKEN (PM2 internal calls)
  const token = req.headers["x-admin-token"];
  if (token && token === effectiveAdminToken) {
    next();
    return;
  }

  // Path 2: browser session — signed JWT issued by /api/login
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const jwtToken = authHeader.slice(7);
    try {
      const payload = jwt.verify(jwtToken, effectiveJwtSecret) as { email: string; role: string };
      if (payload.role === "admin") {
        // Confirm user is still enabled in the live user list
        const users: InternalUser[] = usersCache ?? (readDatabase().users || []);
        const user = users.find(
          u => u.email === payload.email && u.role === "admin" && u.enabled !== false
        );
        if (user) {
          (req as any).adminEmail = payload.email;
          next();
          return;
        }
      }
    } catch {
      // Invalid or expired JWT — fall through to 401
    }
  }

  res.status(401).json({ error: "Unauthorized." });
}
