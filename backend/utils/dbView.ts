/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatabaseSchema } from "../storage/db";

/**
 * canAccessPortal — the single source of truth for whether a given admin may
 * see/manage a given portal: they created it, it's a legacy portal with no
 * owner, a Super Admin granted them extra access to it via their own
 * allowedPortals (the same field that restricts a viewer's portal login —
 * for an admin it instead grants access beyond what they personally created),
 * or they're a Super Admin themselves (who can access every portal). Used
 * consistently by every portal-list filter and per-portal action check across
 * the backend so none of them can drift out of sync with each other.
 *
 * Unlike the viewer-login check (verify-credentials), an EMPTY allowedPortals
 * here grants NO extra access — an admin only sees their own portals until a
 * Super Admin explicitly adds more. This is the opposite default from the
 * viewer case (where empty means unrestricted), because the two are opposite
 * risk directions: an unrestricted viewer login is the safe default (they
 * still can't do anything without also having a solution's credentials), but
 * an admin seeing every portal by default would defeat portal isolation.
 */
export function canAccessPortal(
  portal: { createdBy?: string; name?: string; id?: string },
  adminEmail: string | undefined,
  isSuperAdmin: boolean,
  users: { email: string; allowedPortals?: string[] }[] = []
): boolean {
  if (isSuperAdmin) return true;
  if (!portal.createdBy) return true;
  if (portal.createdBy === adminEmail) return true;
  if (!adminEmail) return false;
  const granted = users.find(u => u.email === adminEmail)?.allowedPortals || [];
  if (granted.length === 0) return false;
  return granted.includes("all") || granted.includes(portal.name || "") || granted.includes(portal.id || "");
}

/**
 * visibleUsersForRole — a regular admin only ever sees viewer-role users they
 * personally onboarded. Never other admins or superadmins (not even themselves,
 * in this list) — they must not be able to learn who else administers the
 * system — and never another admin's viewers, which are that admin's business
 * alone. A superadmin sees everyone.
 *
 * An account with no createdBy is visible to superadmins only. That is the
 * opposite of the lenient treatment legacy portals get in canAccessPortal
 * above, and deliberately so: a portal with no owner is shared infrastructure,
 * whereas a user account with no recorded owner is one whose ownership we
 * simply failed to record, and showing it to every admin is the exact leak this
 * filter exists to prevent. Startup backfills createdBy from the audit log
 * (see backend/auth/seed.ts) so pre-existing accounts keep their real owner
 * rather than silently vanishing.
 *
 * Applied everywhere a user list reaches an admin-facing response
 * (GET /api/database, buildAdminSafeDbView, and /api/admin/users' own
 * response) so this can't be bypassed by reading raw network responses even
 * where the UI wouldn't render the extra rows.
 */
export function visibleUsersForRole<T extends { role: string; createdBy?: string }>(
  users: T[],
  isSuperAdmin: boolean,
  adminEmail?: string
): T[] {
  if (isSuperAdmin) return users;
  return users.filter(u => u.role === "viewer" && !!u.createdBy && u.createdBy === adminEmail);
}

/**
 * canManageUser — whether the requesting admin may view/edit/delete this
 * specific user record. Mirrors visibleUsersForRole exactly, so an admin can't
 * be handed an id they can't see (from an old cached page, a log entry, a
 * guessed id) and use it to act on an account the list would have hidden.
 */
export function canManageUser(
  target: { role: string; createdBy?: string } | undefined,
  isSuperAdmin: boolean,
  adminEmail?: string
): boolean {
  if (isSuperAdmin) return true;
  if (!target || target.role !== "viewer") return false;
  return !!target.createdBy && target.createdBy === adminEmail;
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
    isSuperAdmin,
    adminEmail
  );
  const filteredSubdomains = (safeDb.subdomains || []).filter((s: any) => canAccessPortal(s, adminEmail, isSuperAdmin, safeDb.users || []));
  return { ...safeDb, users: safeUsers, subdomains: filteredSubdomains };
}
