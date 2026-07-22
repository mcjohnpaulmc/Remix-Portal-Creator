/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import express from "express";
import { BCRYPT_ROUNDS, ADMIN_TOKEN, JWT_SECRET as CFG_JWT_SECRET } from "../config";
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
// In production JWT_SECRET must be set in the environment — no fallback is
// allowed because the Windows filesystem does not enforce 0o600 permissions
// on persisted secret files, making any auto-generated file world-readable.

if (process.env.NODE_ENV === "production" && !CFG_JWT_SECRET) {
  // eslint-disable-next-line no-console
  console.error(
    "[Auth] FATAL: JWT_SECRET env var is not set. " +
    "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" " +
    "and add it to your .env file."
  );
  process.exit(1);
}

export const effectiveJwtSecret: string = CFG_JWT_SECRET ||
  createHash("sha256").update(`jwt-${Math.random()}${Date.now()}`).digest("hex");

if (!CFG_JWT_SECRET) {
  logger.warn(
    "Auth",
    "JWT_SECRET env var not set — using in-memory ephemeral secret (dev only). " +
    "Sessions will not survive a server restart. Set JWT_SECRET in .env for production."
  );
}

// ── Admin token ────────────────────────────────────────────────────────────────

if (process.env.NODE_ENV === "production" && !ADMIN_TOKEN) {
  // eslint-disable-next-line no-console
  console.error(
    "[Auth] FATAL: ADMIN_TOKEN env var is not set. " +
    "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" " +
    "and add it to your .env file."
  );
  process.exit(1);
}

export const effectiveAdminToken: string = ADMIN_TOKEN ||
  createHash("sha256").update(`admin-${Math.random()}${Date.now()}`).digest("hex");

if (!ADMIN_TOKEN) {
  logger.warn(
    "Auth",
    "ADMIN_TOKEN env var not set — using ephemeral random token (dev only). " +
    "Set ADMIN_TOKEN in .env so portal processes can receive hot-reload signals."
  );
}

// ── In-memory users cache ──────────────────────────────────────────────────────

let usersCache: InternalUser[] | null = null;

export function getUsersCache(): InternalUser[] | null {
  return usersCache;
}

export function setUsersCache(users: InternalUser[] | null): void {
  usersCache = users;
}

// ── JWT issue / verify helpers ─────────────────────────────────────────────────

export function issueJwt(email: string, role: string): string {
  return jwt.sign({ email, role }, effectiveJwtSecret, { expiresIn: "12h" });
}

function extractJwtFromRequest(req: express.Request): string | null {
  // Prefer HttpOnly cookie (browser sessions)
  const cookieToken = (req as any).cookies?.mobius_token as string | undefined;
  if (cookieToken) return cookieToken;
  // Fall back to Authorization header (server-to-server / Postman)
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) return authHeader.slice(7);
  return null;
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

  // Path 2: browser session — signed JWT (cookie or Authorization header)
  const jwtRaw = extractJwtFromRequest(req);
  if (jwtRaw) {
    try {
      const payload = jwt.verify(jwtRaw, effectiveJwtSecret) as { email: string; role: string };
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

// ── Any-user auth middleware (viewer or admin) ─────────────────────────────────
// Used to gate endpoints that require a login but not necessarily admin role
// (e.g. GET /api/database on the hub).

export function requireAnyAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const jwtRaw = extractJwtFromRequest(req);
  if (jwtRaw) {
    try {
      jwt.verify(jwtRaw, effectiveJwtSecret);
      next();
      return;
    } catch {
      // Invalid or expired
    }
  }
  res.status(401).json({ error: "Unauthorized." });
}
