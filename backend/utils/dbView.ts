/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatabaseSchema } from "../storage/db";

/**
 * canAccessPortal — the single source of truth for whether a given admin may
 * see/manage a given portal: they created it, it's a legacy portal with no
 * owner, a Super Admin explicitly mapped them onto it, or they're a Super
 * Admin themselves (who can access every portal). Used consistently by every
 * portal-list filter and per-portal action check across the backend so none
 * of them can drift out of sync with each other.
 */
export function canAccessPortal(
  portal: { createdBy?: string; mappedAdmins?: string[] },
  adminEmail: string | undefined,
  isSuperAdmin: boolean
): boolean {
  if (isSuperAdmin) return true;
  if (!portal.createdBy) return true;
  if (portal.createdBy === adminEmail) return true;
  return !!adminEmail && (portal.mappedAdmins || []).includes(adminEmail);
}

/**
 * buildAdminSafeDbView — strips secrets (passwordHash, portAssignments) and filters
 * subdomains to only those the requesting admin can access (see canAccessPortal),
 * for any /api/admin response that echoes back the full database. Mirrors the
 * filtering GET /api/database already applies (backend/routes/public.routes.ts)
 * so every response an admin receives is consistent regardless of which endpoint
 * produced it.
 *
 * A superadmin sees every portal regardless of ownership — they're the one role
 * meant to view and edit other admins' portals, solutions, and collaterals.
 */
export function buildAdminSafeDbView(
  db: DatabaseSchema,
  adminEmail: string | undefined,
  isSuperAdmin: boolean = false
): any {
  const { portAssignments: _pa, ...safeDb } = db as any;
  const safeUsers = (safeDb.users || []).map(({ passwordHash: _ph, ...safe }: any) => safe);
  const filteredSubdomains = (safeDb.subdomains || []).filter((s: any) => canAccessPortal(s, adminEmail, isSuperAdmin));
  return { ...safeDb, users: safeUsers, subdomains: filteredSubdomains };
}
