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
  const portalMappedAdmins: string[] = subdomainInfo?.mappedAdmins || [];

  // An item's owner and the portal's owner must agree before the item can appear on
  // that portal — this holds even for a "map to all portals" selection, so "all" only
  // ever broadcasts within the creator's own portals (or a Super-Admin-mapped admin's),
  // never into another admin's. Items or portals with no owner (pre-isolation legacy
  // data) stay visible to everyone, matching the existing backward-compat behavior.
  const isOwnedByPortalCreator = (item: any) =>
    !item.createdBy || !portalOwner || item.createdBy === portalOwner || portalMappedAdmins.includes(item.createdBy);

  const matchesSlug = (item: any, names: string[]) =>
    (names.includes(slug) || names.includes("all")) && isOwnedByPortalCreator(item);

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
