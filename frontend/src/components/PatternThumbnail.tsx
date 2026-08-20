/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { FileText, Presentation, Video, Globe } from "lucide-react";
import { CollateralFilterType } from "../utils/collateralType";

interface PatternThumbnailProps {
  title: string;
  // When provided (collaterals only), renders a type icon instead of the
  // title-initial letter — a missing/broken thumbnail then reads as "this is
  // a video/deck/document/web page" rather than a generic monogram.
  kind?: CollateralFilterType;
}

const GRADIENTS: [string, string][] = [
  ["#7c2d12", "#ea580c"],
  ["#9a3412", "#c2410c"],
  ["#7c2d12", "#f97316"],
  ["#431407", "#ea580c"],
];

export const KIND_ICONS: Record<CollateralFilterType, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  video: Video,
  document: FileText,
  deck: Presentation,
  webpage: Globe,
};

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) & 0xffff;
  }
  return h;
}

export function PatternThumbnail({ title, kind }: PatternThumbnailProps) {
  const h = hashStr(title || "M");
  const [c1, c2] = GRADIENTS[h % GRADIENTS.length];
  const t = h % 4;
  const pid = `pp${h}`;
  const gid = `pg${h}`;
  const initial = (title || "M").trim().charAt(0).toUpperCase();
  const KindIcon = kind ? KIND_ICONS[kind] : null;

  const pat =
    t === 0 ? (
      <pattern id={pid} x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
        <circle cx="10" cy="10" r="2" fill="rgba(255,255,255,0.13)" />
      </pattern>
    ) : t === 1 ? (
      <pattern id={pid} x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="0.5" />
      </pattern>
    ) : t === 2 ? (
      <pattern id={pid} x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="14" stroke="rgba(255,255,255,0.10)" strokeWidth="3" />
      </pattern>
    ) : (
      <pattern id={pid} x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
        <line x1="10" y1="5" x2="10" y2="15" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
        <line x1="5" y1="10" x2="15" y2="10" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
      </pattern>
    );

  return (
    <div className="absolute inset-0">
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
          {pat}
        </defs>
        <rect width="100%" height="100%" fill={`url(#${gid})`} />
        <rect width="100%" height="100%" fill={`url(#${pid})`} />
        {!KindIcon && (
          <text
            x="50%"
            y="52%"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(255,255,255,0.28)"
            fontSize="36"
            fontFamily="monospace"
            fontWeight="bold"
          >
            {initial}
          </text>
        )}
      </svg>
      {KindIcon && (
        <div className="absolute inset-0 flex items-center justify-center">
          <KindIcon className="h-8 w-8 text-white/30" strokeWidth={1.75} />
        </div>
      )}
    </div>
  );
}
