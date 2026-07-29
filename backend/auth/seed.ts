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

  writeDatabase(db);

  // Populate the in-memory cache so login works immediately from S3 data
  setUsersCache(db.users);

  // Push the authoritative merged list back to S3 (best-effort)
  s3SyncUsers(db.users).catch(() => {});
}
