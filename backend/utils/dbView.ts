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
 * visibleUsersForRole — a regular admin only ever sees viewer-role users, never
 * other admins or superadmins (not even themselves, in this list) — they must
 * not be able to learn who else administers the system. A superadmin sees
 * everyone. Applied everywhere a user list reaches an admin-facing response
 * (GET /api/database, buildAdminSafeDbView, and /api/admin/users' own
 * response) so this can't be bypassed by reading raw network responses even
 * where the UI wouldn't render the extra rows.
 */
export function visibleUsersForRole<T extends { role: string }>(users: T[], isSuperAdmin: boolean): T[] {
  return isSuperAdmin ? users : users.filter(u => u.role === "viewer");
}

/**
 * canManageUser — whether the requesting admin may view/edit/delete this
 * specific user record. A regular admin may only ever act on viewers, mirroring
 * visibleUsersForRole — they can't be handed another admin's id (e.g. from an
 * old cached page or log entry) and use it to bypass the list-level filtering.
 */
export function canManageUser(target: { role: string } | undefined, isSuperAdmin: boolean): boolean {
  if (isSuperAdmin) return true;
  return target?.role === "viewer";
}

/**
 * buildAdminSafeDbView — strips secrets (passwordHash, portAssignments), filters
 * subdomains to only those the requesting admin can access (see canAccessPortal),
 * and filters users to only what they're allowed to know about (see
 * visibleUsersForRole), for any /api/admin response that echoes back the full
 * database. Mirrors the filtering GET /api/database already applies
 * (backend/routes/public.routes.ts) so every response an admin receives is
 * consistent regardless of which endpoint produced it.
 *
 * A superadmin sees every portal and every user regardless of ownership/role —
 * they're the one role meant to view and edit everything.
 */
export function buildAdminSafeDbView(
  db: DatabaseSchema,
  adminEmail: string | undefined,
  isSuperAdmin: boolean = false
): any {
  const { portAssignments: _pa, ...safeDb } = db as any;
  const safeUsers = visibleUsersForRole(
    (safeDb.users || []).map(({ passwordHash: _ph, ...safe }: any) => safe),
    isSuperAdmin
  );
  const filteredSubdomains = (safeDb.subdomains || []).filter((s: any) => canAccessPortal(s, adminEmail, isSuperAdmin));
  return { ...safeDb, users: safeUsers, subdomains: filteredSubdomains };
}
