/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { hashPassword, setUsersCache } from "./index";
import { readDatabase, writeDatabase, InternalUser } from "../storage/db";
import { loadUsersFromS3, s3SyncUsers } from "../storage/s3";
import { SYSTEM_ADMIN_EMAIL } from "../config";
import { logger } from "../logger";

export async function seedDefaultAdmin(): Promise<void> {
  const adminPassword = process.env.SYSTEM_ADMIN_PASSWORD;
  if (!adminPassword) {
    logger.warn(
      "Auth",
      "SYSTEM_ADMIN_PASSWORD env var not set — system admin password will not be enforced on startup"
    );
  }

  const db = readDatabase();
  if (!db.users) db.users = [];

  // Pull users from S3 as the authoritative source; merge into local DB
  const s3Users = await loadUsersFromS3();
  if (s3Users && s3Users.length > 0) {
    // S3 wins: replace local users list (preserving any local-only entries not yet in S3)
    const s3Emails = new Set(s3Users.map(u => u.email));
    const localOnly = db.users.filter(u => !s3Emails.has(u.email));
    db.users = [...s3Users, ...localOnly];
    logger.info("Auth", `Merged ${s3Users.length} S3 users into local DB`);
  }

  // Ensure system admin exists and is always correct regardless of prior UI actions.
  // The system account is seeded as superadmin — it's the one account that must
  // always be able to view/edit every other admin's portals, solutions, and
  // collaterals, and it's also the only way to bootstrap the very first
  // superadmin (the /api/admin/users route requires an existing superadmin to
  // grant that role to anyone else, so someone has to start out holding it).
  const idx = db.users.findIndex(u => u.email === SYSTEM_ADMIN_EMAIL);
  if (idx === -1) {
    if (!adminPassword) {
      logger.error(
        "Auth",
        "Cannot seed system admin: SYSTEM_ADMIN_PASSWORD env var is required on first run"
      );
      return;
    }
    db.users.unshift({
      id: "system-admin-eswar",
      email: SYSTEM_ADMIN_EMAIL,
      name: "Eswar (Super Admin)",
      role: "superadmin",
      passwordHash: hashPassword(adminPassword),
      createdAt: new Date().toISOString(),
      enabled: true,
      isSystem: true,
    } as InternalUser);
    logger.info("Auth", `Created system admin: ${SYSTEM_ADMIN_EMAIL}`);
  } else {
    db.users[idx] = {
      ...db.users[idx],
      ...(adminPassword ? { passwordHash: hashPassword(adminPassword) } : {}),
      role: "superadmin",
      enabled: true,
      isSystem: true,
    };
    logger.info("Auth", `System admin enforced: ${SYSTEM_ADMIN_EMAIL}`);
  }

  backfillUserCreators(db);

  writeDatabase(db);

  // Populate the in-memory cache so login works immediately from S3 data
  setUsersCache(db.users);

  // Push the authoritative merged list back to S3 (best-effort)
  s3SyncUsers(db.users).catch(() => {});
}

// "User Created" audit entries name the created account inside parentheses, e.g.
//   User "Jane Doe" (jane@acme.com) onboarded with role: viewer.
const CREATED_USER_EMAIL = /\(([^)\s]+@[^)\s]+)\)/;

/**
 * backfillUserCreators — recovers createdBy for accounts that predate the field,
 * by reading it back out of the audit log.
 *
 * Without this, every existing account would be left unowned, and since an
 * unowned account is visible to superadmins only (see visibleUsersForRole),
 * they would all disappear from the admin who actually onboarded them. The log
 * already records who created whom, so the ownership is recoverable rather than
 * guessed. Anything with no matching log entry stays unowned, which is the safe
 * direction: hidden from regular admins until a superadmin sorts it out.
 *
 * Mutates `db` in place; the caller persists. Idempotent — accounts that
 * already have a createdBy are never touched.
 */
export function backfillUserCreators(db: ReturnType<typeof readDatabase>): number {
  const needsOwner = (db.users || []).filter(u => !u.createdBy && !u.isSystem);
  if (needsOwner.length === 0) return 0;

  // Oldest first, so that if an account was somehow created more than once the
  // most recent entry is the one that sticks.
  const creationLogs = (db.userLogs || [])
    .filter(l => l.action === "User Created")
    .slice()
    .reverse();

  const ownerByEmail = new Map<string, string>();
  for (const log of creationLogs) {
    const match = CREATED_USER_EMAIL.exec(log.details || "");
    if (match && log.email) ownerByEmail.set(match[1].toLowerCase(), log.email);
  }

  let filled = 0;
  for (const user of needsOwner) {
    const owner = ownerByEmail.get(user.email.toLowerCase());
    if (owner) {
      user.createdBy = owner;
      filled++;
    }
  }

  const stillUnowned = needsOwner.length - filled;
  logger.info(
    "Auth",
    `Backfilled createdBy for ${filled} user(s) from the audit log` +
    (stillUnowned > 0
      ? `; ${stillUnowned} account(s) have no creation record and stay visible to Super Admins only.`
      : ".")
  );
  return filled;
}
