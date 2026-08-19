/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Collateral } from "../../../shared/types";

// Buckets every collateral's free-form fileType/tag string into one of these
// four kinds (matches the "video, doc, pptx, web sources/articles" taxonomy
// collaterals are actually imported as). Shared by the Collaterals Catalogue
// filter, the admin collateral list, and the PatternThumbnail fallback icon.
export type CollateralFilterType = "document" | "deck" | "video" | "webpage";

export const COLLATERAL_FILTER_OPTIONS: { value: CollateralFilterType; label: string }[] = [
  { value: "document", label: "Document" },
  { value: "deck", label: "Deck" },
  { value: "video", label: "Video" },
  { value: "webpage", label: "Web page" },
];

export function classifyCollateralType(col: Collateral): CollateralFilterType {
  const hay = `${col.fileType || ""} ${col.tag || ""}`.toLowerCase();
  if (hay.includes("video") || hay.includes("demo")) return "video";
  if (hay.includes("deck") || hay.includes("slide") || hay.includes("ppt") || hay.includes("presentation")) return "deck";
  if (hay.includes("web") || hay.includes("article") || hay.includes("link") || hay.includes("source")) return "webpage";
  return "document";
}
