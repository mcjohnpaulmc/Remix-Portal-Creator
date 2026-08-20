/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SubdomainPortal {
  id: string; // e.g., 'unilever'
  name: string; // e.g., 'unilever'
  displayName: string; // e.g., 'Unilever APAC'
  createdAt: string;
  createdBy?: string;  // email of the admin who created this portal; used for isolation
  port?: number;      // assigned port this portal runs on (e.g. 4001)
  domain?: string;    // selected domain (e.g. 'mobiusservices.io')
  s3Key?: string;     // S3 prefix: 'Mobius_Portal_Creator_Hub/<slug>/'
  isDummy?: boolean;  // true = localhost-only dev portal, no subdomain/domain
  status?: "live" | "sleep"; // "live" = PM2 process running, "sleep" = stopped (port still reserved)
  dnsStatus?: "pending" | "active" | "not_required"; // Cloudflare DNS assignment state
}

export interface Solution {
  id: string;
  title: string;
  thumbnail: string;
  url: string;
  credentialsDescription: string;
  usernamePrefill?: string;
  passwordPrefill?: string;
  tags?: string[];
  createdAt: string;
  enabled?: boolean;
  customerName?: string; // Associated customer subdomain portal name
  customerNames?: string[]; // Multiple target subdomains
  createdBy?: string; // email of the admin who created this solution; used for portal isolation
  // Set when this solution is a standalone HTML app deployed via "Deploy Solution":
  // deployedSlug/deployedDomain identify the dedicated subdomain hosting the
  // uploaded index.html — url is set to that subdomain's address. Used to clean up
  // the DNS record, IIS site, and stored file when the solution is deleted.
  deployedSlug?: string;
  deployedDomain?: string;
  // Set when this solution is a reverse-proxy mapping created via "Map Subdomain"
  // (Onboard Solution page's left panel) — the external http(s) origin this
  // subdomain forwards to. Distinguishes these from a real "Deploy Solution"
  // upload, which also sets deployedSlug/deployedDomain but has no external
  // origin (it serves a locally-stored file instead).
  mappedExternalUrl?: string;
  // When true, this solution is excluded from the Solution Repository table on
  // the Onboard Solution page (the "Map to solution repository" checkbox was
  // left unticked) — it still exists as a normal solution everywhere else.
  hiddenFromRepository?: boolean;
  // Set when this solution was imported from Mobius/TechMobius — lets the
  // Repository "Update" button re-match it on a later sync (by source record,
  // not by title) so an admin-side title edit doesn't cause a duplicate import.
  sourcePortal?: "mobius" | "techmobius";
  sourceExternalId?: string;
}

export interface Collateral {
  id: string;
  title: string;
  thumbnail: string;
  prompt: string;
  generatedContent: string;
  uploadedFiles: { name: string; size: string; type: string; content?: string; url?: string }[];
  createdAt: string;
  enabled?: boolean;
  customerName?: string; // Associated customer subdomain portal name
  customerNames?: string[]; // Multiple target subdomains
  googleDriveUrl?: string; // Primary Google Drive link URL
  tag?: "case study" | "solution doc" | "sample" | "demo video" | string;
  fileType?: "google slide" | "google video" | "google doc" | "google sheet" | string;
  linkedSolutionId?: string; // id of the Solution this collateral belongs to (set on import; groups the Collaterals Catalogue by solution)
  createdBy?: string; // email of the admin who created this collateral; used for portal isolation
  // Set when this collateral was imported from Mobius/TechMobius — see
  // Solution.sourcePortal/sourceExternalId for why this exists.
  sourcePortal?: "mobius" | "techmobius";
  sourceExternalId?: string;
}

export interface UserLog {
  id: string;
  email: string;
  action: string;
  details: string;
  date: string;
  subdomain?: string;
}

export interface MetricGroup {
  id: string;
  title: string;
  deliveryLabels: string[];
  deliveryValues: number[];
  qualityLabels: string[];
  qualityValues: number[];
  tatTarget?: string;
  tatActual?: string;
  tatLabels?: string[];
  tatValues?: number[];
}

export interface CurrentProject {
  id: string;
  customerName: string; // matches subdomain/slug e.g., 'unilever', 'reliance'
  customerNames?: string[]; // Multiple target subdomains
  name: string;
  description: string;
  department: string;
  deliveryLabels: string[];
  deliveryValues: number[];
  qualityLabels: string[];
  qualityValues: number[];
  innovations: { title: string; impact: string }[];
  tatTarget?: string;
  tatActual?: string;
  tatLabels?: string[];
  tatValues?: number[];
  feedbackRepo: { id: string; description: string; reportedDate: string; resolvedDate: string | null; status: "Open" | "Resolved" }[];
  documents: { name: string; size: string; type: string; content?: string; url?: string }[];
  enabled?: boolean;
  createdAt: string;
  hiddenSections?: string[]; // list of hidden sections/charts, e.g. ['deliveryVolumeChart', 'qualitySLAChart']
  metricGroups?: MetricGroup[];
  createdBy?: string; // email of the admin who created this project; used for portal isolation
}

export interface UpcomingProject {
  id: string;
  customerName: string;
  customerNames?: string[]; // Multiple target subdomains
  name: string;
  description: string;
  status: "Requirement gathering" | "POC / pilot" | "Proposal" | "Awaiting approval";
  scope: string;
  solution: string;
  timelines: string;
  department: string;
  documents: { name: string; size: string; type: string; category: "Sample Data" | "Pricing" | "Proposal" | "Solution Approach"; content?: string; url?: string }[];
  enabled?: boolean;
  createdAt: string;
  hiddenSections?: string[];
  createdBy?: string; // email of the admin who created this project; used for portal isolation
}

export interface CarouselItem {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  linkType: "subdomain" | "project-current" | "project-upcoming" | "solution" | "collateral" | "none";
  linkTarget: string; // Target ID or name
  customerName?: string;
  customerNames?: string[];
}

export interface PortalUser {
  id: string;
  email: string;
  name: string;
  // "superadmin" bypasses per-admin portal/solution/collateral ownership isolation —
  // can view and edit every admin's portals, solutions, and collaterals, not just its own.
  role: "admin" | "viewer" | "superadmin";
  createdAt: string;
  enabled?: boolean;
  isSystem?: boolean; // true = cannot be deleted, edited, or disabled
}

export interface AppState {
  solutions: Solution[];
  collaterals: Collateral[];
  userLogs: UserLog[];
  heroText: string;
  heroPrompt: string;
  subdomain: string;
  subdomains?: SubdomainPortal[];
  currentProjects?: CurrentProject[];
  upcomingProjects?: UpcomingProject[];
  logo?: string; // base64 string or url of custom uploaded logo
  carousel?: CarouselItem[]; // custom slider cards
}
