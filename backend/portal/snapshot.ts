/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatabaseSchema } from "../storage/db";

/**
 * buildPortalSnapshot — projects a portal.json for a given slug from the hub DB.
 * Used by deployPortalInProcess (hub deploy path) and portal-server /api/database.
 */
export function buildPortalSnapshot(
  slug: string,
  db: DatabaseSchema,
  subdomainInfo: any
): object {
  const portalOwner: string | undefined = subdomainInfo?.createdBy;
  const allowedPortalsByEmail = new Map(
    (db.users || []).map(u => [u.email, u.allowedPortals || []] as const)
  );

  // The broad "map to all portals" sentinel is isolation-sensitive: without a check
  // here, ticking "All (Global)" on a solution would broadcast it into every admin's
  // portal, not just the creator's own. So "all" only ever reaches the creator's own
  // portals (or one a Super Admin granted them via their own allowedPortals). Items
  // or portals with no owner (pre-isolation legacy data) stay visible to everyone,
  // matching the existing backward-compat behavior.
  //
  // An EXPLICIT mapping to this specific portal (this slug named directly in
  // customerNames) is different — Map Solutions already permission-checks that at
  // mapping time (mappingPermissionError in content.routes.ts, gated by the mapping
  // admin's own portal access, not the content's creator). Re-checking ownership here
  // would just hide a mapping that was already legitimately authorized, which is what
  // made a portal explicitly mapped to 7 solutions only display 3 of them.
  const isOwnedByPortalCreator = (item: any) => {
    if (!item.createdBy || !portalOwner || item.createdBy === portalOwner) return true;
    const granted = allowedPortalsByEmail.get(item.createdBy) || [];
    return granted.includes("all") || granted.includes(slug);
  };

  const matchesSlug = (item: any, names: string[]) => {
    if (names.includes(slug)) return true;
    if (names.includes("all")) return isOwnedByPortalCreator(item);
    return false;
  };

  return {
    slug,
    subdomain: slug,
    deployedAt: new Date().toISOString(),
    heroText: db.heroText,
    logo: db.logo || "",
    carousel: (db.carousel || []).filter((c: any) =>
      !c.customerName || c.customerName === slug || c.customerName === "all"
    ),
    solutions: (db.solutions || []).filter((s: any) =>
      matchesSlug(s, s.customerNames || (s.customerName ? [s.customerName] : ["all"]))
    ),
    collaterals: (db.collaterals || []).filter((c: any) =>
      matchesSlug(c, c.customerNames || (c.customerName ? [c.customerName] : ["all"]))
    ),
    currentProjects: (db.currentProjects || []).filter((p: any) =>
      matchesSlug(p, p.customerNames || [p.customerName])
    ),
    upcomingProjects: (db.upcomingProjects || []).filter((p: any) =>
      matchesSlug(p, p.customerNames || [p.customerName])
    ),
    subdomainInfo,
    subdomains: [],
    userLogs: [],
    heroPrompt: "",
    users: (db.users || []).filter(u => u.enabled !== false).map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      createdAt: u.createdAt,
    })),
  };
}

/**
 * publicDbProjection — strips passwordHash from any data object's users array.
 * Use this on any outbound /api/database response.
 */
export function publicDbProjection(data: any): any {
  const safeUsers = (data.users || []).map(({ passwordHash: _ph, ...safe }: any) => safe);
  return { ...data, users: safeUsers };
}
