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
}

export interface UserLog {
  id: string;
  email: string;
  action: string;
  details: string;
  date: string;
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
