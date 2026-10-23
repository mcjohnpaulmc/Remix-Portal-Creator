/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Solution, Collateral, CurrentProject, UpcomingProject, SubdomainPortal } from "../../../shared/types";

interface SidebarStatsProps {
  portals: SubdomainPortal[];
  solutions: Solution[];
  collaterals: Collateral[];
  currentProjects: CurrentProject[];
  opportunities: UpcomingProject[];
}

/**
 * SidebarStats — fills the dead space under the Control Console nav with a live
 * read-out of what the hub currently holds.
 *
 * Everything here is derived from state App already has, so it costs no extra
 * request and updates with the rest of the console. Palette is the sidebar's own
 * (slate-950/900/800 with orange-500 and emerald-400 accents) — no new colours.
 */
export function SidebarStats({
  portals,
  solutions,
  collaterals,
  currentProjects,
  opportunities,
}: SidebarStatsProps) {
  const livePortals = portals.filter((p) => p.status === "live").length;
  const totalPortals = portals.length;

  // Mirrors the Onboard Solution page's Solution Repository: items hidden from the
  // repository are utilities, not catalogue entries, and would inflate the count.
  const repoSolutions = solutions.filter((s) => !s.hiddenFromRepository);
  const deployed = repoSolutions.filter((s) => !!s.deployedSlug).length;
  const onboarded = repoSolutions.length - deployed;

  const livePct = totalPortals === 0 ? 0 : Math.round((livePortals / totalPortals) * 100);
  const deployedPct = repoSolutions.length === 0 ? 0 : Math.round((deployed / repoSolutions.length) * 100);

  const tiles: { label: string; value: number; accent: string }[] = [
    { label: "Portals", value: totalPortals, accent: "text-slate-100" },
    { label: "Live now", value: livePortals, accent: "text-emerald-400" },
    { label: "Solutions", value: repoSolutions.length, accent: "text-slate-100" },
    { label: "Collaterals", value: collaterals.length, accent: "text-slate-100" },
    { label: "Engagements", value: currentProjects.length, accent: "text-slate-100" },
    { label: "Opportunities", value: opportunities.length, accent: "text-orange-400" },
  ];

  return (
    <div className="pt-5 border-t border-slate-900 space-y-3">
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        <span className="text-[9px] font-mono tracking-widest text-slate-500 uppercase font-semibold">
          System Metrics
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="relative px-2.5 py-2 bg-slate-900/60 border border-slate-800 rounded-lg overflow-hidden"
          >
            <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-orange-500/70" />
            <div className={`font-mono text-base font-bold leading-none tabular-nums ${tile.accent}`}>
              {tile.value}
            </div>
            <div className="text-[8.5px] font-mono uppercase tracking-wider text-slate-500 mt-1 truncate">
              {tile.label}
            </div>
          </div>
        ))}
      </div>

      {/* Deployed vs onboarded, as a share of the repository */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[8.5px] font-mono uppercase tracking-wider">
          <span className="text-slate-500">Deployed</span>
          <span className="text-slate-400 tabular-nums">
            {deployed} / {repoSolutions.length}
          </span>
        </div>
        <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-orange-600 to-orange-400 rounded-full transition-all duration-500"
            style={{ width: `${deployedPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[8.5px] font-mono text-slate-600">
          <span>{onboarded} onboarded</span>
          <span className="tabular-nums">{deployedPct}%</span>
        </div>
      </div>

      {/* Portal uptime share */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[8.5px] font-mono uppercase tracking-wider">
          <span className="text-slate-500">Portals live</span>
          <span className="text-slate-400 tabular-nums">
            {livePortals} / {totalPortals}
          </span>
        </div>
        <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500/80 rounded-full transition-all duration-500"
            style={{ width: `${livePct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
