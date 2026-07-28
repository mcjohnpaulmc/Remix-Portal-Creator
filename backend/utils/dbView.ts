/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatabaseSchema } from "../storage/db";

/**
 * buildAdminSafeDbView — strips secrets (passwordHash, portAssignments) and filters
 * subdomains to only those owned by the requesting admin, for any /api/admin response
 * that echoes back the full database. Legacy portals with no createdBy remain visible
 * to all admins for backward compatibility. Mirrors the filtering GET /api/database
 * already applies (backend/routes/public.routes.ts) so every response an admin
 * receives is consistent regardless of which endpoint produced it.
 */
export function buildAdminSafeDbView(db: DatabaseSchema, adminEmail: string | undefined): any {
  const { portAssignments: _pa, ...safeDb } = db as any;
  const safeUsers = (safeDb.users || []).map(({ passwordHash: _ph, ...safe }: any) => safe);
  const filteredSubdomains = (safeDb.subdomains || []).filter(
    (s: any) => !s.createdBy || s.createdBy === adminEmail
  );
  return { ...safeDb, users: safeUsers, subdomains: filteredSubdomains };
}
