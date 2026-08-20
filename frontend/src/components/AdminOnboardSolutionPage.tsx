/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { PlusCircle, Rocket, Link2, Download } from "lucide-react";
import { Solution, Collateral, SubdomainPortal } from "../../../shared/types";
import { AdminSolutions } from "./AdminSolutions";
import { DeploySolutionForm } from "./DeploySolutionForm";
import { EditSolutionQuickPopup } from "./EditSolutionQuickPopup";
import { MapSubdomainPanel } from "./MapSubdomainPanel";

interface AdminOnboardSolutionPageProps {
  solutions: Solution[];
  collaterals?: Collateral[];
  subdomains: SubdomainPortal[];
  onRefresh: (action: string, solutionData: any) => Promise<void>;
  onReload?: () => Promise<void>;
  adminUserEmail?: string;
  // Bottom-right toast trigger, passed through to EditSolutionQuickPopup for its
  // subdomain-rename flow.
  onNotify?: (message: string) => void;
}

export function AdminOnboardSolutionPage({
  solutions,
  collaterals = [],
  subdomains,
  onRefresh,
  onReload,
  adminUserEmail = "",
  onNotify,
}: AdminOnboardSolutionPageProps) {
  const [openPopup, setOpenPopup] = useState<"onboard" | "deploy" | null>(null);
  const [updatingRepo, setUpdatingRepo] = useState(false);
  const [editingSolution, setEditingSolution] = useState<Solution | null>(null);
  const [repoFilter, setRepoFilter] = useState<"all" | "onboarded" | "deployed">("all");
  const subdomainProp = subdomains.map((s) => ({ id: s.id, name: s.name, displayName: s.displayName }));

  // "Map to solution repository" left unticked when mapping a subdomain keeps a
  // solution out of this whole section (counts included) — it's still a normal,
  // manageable solution everywhere else (Map Solutions, Edit, Delete).
  const repositorySolutions = solutions.filter((s) => !s.hiddenFromRepository);
  const totalCount = repositorySolutions.length;
  const deployedCount = repositorySolutions.filter((s) => !!s.deployedSlug).length;
  const onboardedCount = totalCount - deployedCount;
  const repoFilters: { key: "all" | "onboarded" | "deployed"; label: string; count: number }[] = [
    { key: "all", label: "Total", count: totalCount },
    { key: "onboarded", label: "Onboarded", count: onboardedCount },
    { key: "deployed", label: "Deployed", count: deployedCount },
  ];
  const filteredSolutions = repositorySolutions.filter((s) => {
    if (repoFilter === "onboarded") return !s.deployedSlug;
    if (repoFilter === "deployed") return !!s.deployedSlug;
    return true;
  });

  // Pulls every solution from Mobius + TechMobius: brand-new ones land in the Hub
  // Repository unmapped, and ones already imported here get their thumbnail,
  // description, and credentials refreshed in place from the source (matched by
  // the original import record, not by title, so a local rename doesn't cause a
  // duplicate). Refreshed solutions auto-deploy to every live portal they're
  // already mapped to, same as any other content edit.
  const handleUpdateRepository = async () => {
    setUpdatingRepo(true);
    try {
      const res = await fetch("/api/admin/external-portals/solutions", { credentials: "include" });
      if (!res.ok) {
        alert("Could not reach Mobius/TechMobius portals.");
        return;
      }
      const portalSolutions: { mobius: { id: string; title: string }[]; techmobius: { id: string; title: string }[] } = await res.json();

      const jobs: { portal: "mobius" | "techmobius"; solutionIds: string[] }[] = [];
      for (const portal of ["mobius", "techmobius"] as const) {
        const ids = (portalSolutions[portal] ?? []).map((s) => s.id);
        if (ids.length > 0) jobs.push({ portal, solutionIds: ids });
      }

      if (jobs.length === 0) {
        alert("Could not reach Mobius/TechMobius, or both portals have nothing to sync.");
        return;
      }

      let totalNewSolutions = 0;
      let totalUpdatedSolutions = 0;
      let totalNewCollaterals = 0;
      let totalUpdatedCollaterals = 0;
      const errors: string[] = [];

      for (const job of jobs) {
        try {
          const importRes = await fetch("/api/admin/external-portals/import", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ portal: job.portal, solutionIds: job.solutionIds, customerNames: [] }),
          });
          const data = await importRes.json();
          if (!importRes.ok) {
            errors.push(data.error || `Sync from ${job.portal} failed.`);
            continue;
          }
          totalNewSolutions += data.importedSolutions || 0;
          totalUpdatedSolutions += data.updatedSolutions || 0;
          totalNewCollaterals += data.importedCollaterals || 0;
          totalUpdatedCollaterals += data.updatedCollaterals || 0;
        } catch {
          errors.push(`Sync from ${job.portal} failed — server unreachable.`);
        }
      }

      await onReload?.();

      const summary = `Added ${totalNewSolutions} new solution(s) and refreshed ${totalUpdatedSolutions} existing one(s). ` +
        `Collaterals: ${totalNewCollaterals} new, ${totalUpdatedCollaterals} refreshed. ` +
        `Changes are now live on every portal they're mapped to.`;
      alert(errors.length > 0 ? `${summary}\n\n${errors.join("\n")}` : summary);
    } catch {
      alert("Server error updating the repository.");
    } finally {
      setUpdatingRepo(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-base font-bold text-slate-900 leading-tight">
          Onboard Solution
        </h3>
        <p className="text-xs text-slate-500">
          Add a brand-new solution to the catalogue, or deploy a standalone HTML app to its own subdomain.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {openPopup !== "onboard" && (
          <motion.button
            layoutId="onboard-solution-card"
            type="button"
            onClick={() => setOpenPopup("onboard")}
            className="text-left p-5 bg-white border border-slate-200 rounded-2xl shadow-xs hover:shadow-md hover:border-orange-300 transition-shadow duration-200 cursor-pointer flex items-center gap-4"
          >
            <div className="h-10 w-10 shrink-0 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center">
              <PlusCircle className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <h4 className="text-base font-bold text-orange-600">Map/Onboard Solution</h4>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                Map a subdomain to an already-public app, or manually register a new solution to the repository.
              </p>
            </div>
          </motion.button>
        )}

        {openPopup !== "deploy" && (
          <motion.button
            layoutId="deploy-solution-card"
            type="button"
            onClick={() => setOpenPopup("deploy")}
            className="text-left p-5 bg-gradient-to-br from-slate-900 to-blue-950 border border-blue-900/50 rounded-2xl shadow-md hover:shadow-lg transition-shadow duration-200 cursor-pointer flex items-center gap-4"
          >
            <div className="h-10 w-10 shrink-0 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center">
              <Rocket className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <h4 className="text-base font-bold text-orange-400">Deploy Solution</h4>
              <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                Upload a self-contained HTML app and host it on its own subdomain.
              </p>
            </div>
          </motion.button>
        )}
      </div>

      {/* Solution Repository — every solution in the hub, regardless of how many
          portals (if any) it's currently mapped to. */}
      <div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900 leading-tight">
              Solution Repository
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Every solution onboarded to the hub — a solution can be mapped to more than one portal from the Map Solutions page.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {/* Total / Onboarded / Deployed filter — a sliding glass highlight
                marks the active segment, seamlessly moving when clicked. */}
            <div className="flex items-stretch bg-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {repoFilters.map((f, i) => {
                const active = repoFilter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setRepoFilter(f.key)}
                    className={`relative px-4 py-1.5 text-center cursor-pointer ${i > 0 ? "border-l border-slate-200" : ""}`}
                  >
                    {active && (
                      <motion.div
                        layoutId="repo-filter-highlight"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                        className="absolute inset-1 rounded-lg bg-white/70 backdrop-blur-md border border-white shadow-sm"
                      />
                    )}
                    <div className="relative z-10">
                      <div className={`text-[9px] font-mono uppercase tracking-wider ${active ? "text-slate-600" : "text-slate-400"}`}>
                        {f.label}
                      </div>
                      <div className={`text-sm font-bold ${active ? "text-slate-900" : "text-slate-500"}`}>
                        {f.count}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={handleUpdateRepository}
              disabled={updatingRepo}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 shrink-0"
              title="Import new solutions and refresh existing ones (thumbnail, description, credentials) from Mobius and TechMobius"
            >
              <Download className={`h-3.5 w-3.5 ${updatingRepo ? "animate-pulse" : ""}`} />
              {updatingRepo ? "Updating…" : "Update"}
            </button>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 text-[10px] font-mono uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Solution Name</th>
                <th className="px-4 py-2.5 font-semibold">URL</th>
                <th className="px-4 py-2.5 font-semibold text-right">Collaterals</th>
                <th className="px-4 py-2.5 font-semibold text-right">Modify</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSolutions.map((sol) => {
                const collateralCount = collaterals.filter((c) => c.linkedSolutionId === sol.id).length;
                return (
                  <tr key={sol.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-2.5 font-semibold text-slate-800 truncate max-w-[260px]">{sol.title}</td>
                    <td className="px-4 py-2.5 text-slate-500 font-mono truncate max-w-[320px]">
                      {sol.url ? (
                        <a
                          href={sol.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                        >
                          <Link2 className="h-3 w-3 shrink-0" />
                          <span className="truncate">{sol.url}</span>
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{collateralCount}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => setEditingSolution(sol)}
                        className="inline-flex items-center px-2 py-1 border border-slate-200 rounded bg-slate-50 hover:bg-slate-100 text-slate-600 text-[10px] font-semibold transition-colors"
                        title="Modify Solution"
                      >
                        Modify
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredSolutions.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400 font-mono">
                    {repositorySolutions.length === 0 ? "No solutions onboarded yet." : "No solutions match this filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {openPopup === "onboard" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setOpenPopup(null)}
          >
            <motion.div
              layoutId="onboard-solution-card"
              className="w-full max-w-7xl max-h-[88vh] overflow-y-auto rounded-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <MapSubdomainPanel
                  onReload={onReload}
                  onClose={() => setOpenPopup(null)}
                />
                <AdminSolutions
                  solutions={solutions}
                  onRefresh={onRefresh}
                  adminUserEmail={adminUserEmail}
                  onClose={() => setOpenPopup(null)}
                />
              </div>
            </motion.div>
          </motion.div>
        )}

        {openPopup === "deploy" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setOpenPopup(null)}
          >
            <motion.div
              layoutId="deploy-solution-card"
              className="w-full max-w-4xl max-h-[88vh] overflow-y-auto rounded-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <DeploySolutionForm
                subdomains={subdomainProp}
                onReload={onReload}
                onClose={() => setOpenPopup(null)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {editingSolution && (
        <div
          className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setEditingSolution(null)}
        >
          <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <EditSolutionQuickPopup
              solution={editingSolution}
              onRefresh={onRefresh}
              adminUserEmail={adminUserEmail}
              onClose={() => setEditingSolution(null)}
              onNotify={onNotify}
            />
          </div>
        </div>
      )}
    </div>
  );
}
