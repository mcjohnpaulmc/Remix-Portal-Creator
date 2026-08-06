/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { X } from "lucide-react";
import { Solution, Collateral } from "../../../shared/types";

interface ExternalSolution {
  id: string;
  title: string;
  targetUrl: string;
  thumbnailUrl: string;
  practice: string;
  solutionType: string;
  credentialsNote: string;
  defaultUsername: string;
  collateralCount: number;
}

interface ImportFromPortalPanelProps {
  // Full, unfiltered solutions list — used to dedupe against titles already in the hub.
  solutions: Solution[];
  // Full, unfiltered solutions list used for the Hub Repository unmapped picker —
  // usually the same array as `solutions`, kept separate for callers that scope
  // `solutions` differently.
  repoSolutions: Solution[];
  collaterals?: Collateral[];
  // Portal(s) that imported/mapped solutions should be attached to.
  targetPortalNames: string[];
  // Persists a Hub Repository solution's updated customerNames — same signature
  // as the onRefresh prop threaded through every other admin write in this app.
  onRefresh: (action: string, data: any) => Promise<void>;
  onImported: () => void | Promise<void>;
  title?: string;
}

export function ImportFromPortalPanel({
  solutions,
  repoSolutions,
  collaterals = [],
  targetPortalNames,
  onRefresh,
  onImported,
  title = "🔗 Import from Portal (optional)",
}: ImportFromPortalPanelProps) {
  const [portalSolutions, setPortalSolutions] = useState<{ mobius: ExternalSolution[]; techmobius: ExternalSolution[] } | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [selectedMobius, setSelectedMobius] = useState<Set<string>>(new Set());
  const [selectedTechmobius, setSelectedTechmobius] = useState<Set<string>>(new Set());
  const [selectedHubRepo, setSelectedHubRepo] = useState<Set<string>>(new Set());
  const [activeImportModal, setActiveImportModal] = useState<"mobius" | "techmobius" | "hubRepo" | null>(null);
  const [importing, setImporting] = useState(false);
  const [mappingHubRepo, setMappingHubRepo] = useState(false);

  React.useEffect(() => {
    if (portalSolutions === null && !portalLoading) {
      loadPortalSolutions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPortalSolutions = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/admin/external-portals/solutions", { credentials: "include" });
      if (res.ok) setPortalSolutions(await res.json());
    } catch {
      setPortalSolutions({ mobius: [], techmobius: [] });
    } finally {
      setPortalLoading(false);
    }
  };

  // Import runs server-side (POST /api/admin/external-portals/import) rather than
  // creating solutions one-by-one from the client: the hub server is the only party
  // that can actually reach the source portal's internal address to (a) pull each
  // solution's linked collaterals and (b) download + re-host thumbnail images so
  // they render for any browser, regardless of what scheme/host the source used.
  const handleBulkImport = async () => {
    if (!portalSolutions) return;
    const jobs: { portal: "mobius" | "techmobius"; solutionIds: string[] }[] = [];
    if (selectedMobius.size > 0) jobs.push({ portal: "mobius", solutionIds: Array.from(selectedMobius) });
    if (selectedTechmobius.size > 0) jobs.push({ portal: "techmobius", solutionIds: Array.from(selectedTechmobius) });
    if (jobs.length === 0) return;

    setImporting(true);
    try {
      let totalSolutions = 0;
      let totalCollaterals = 0;
      let totalSkipped = 0;
      const errors: string[] = [];

      for (const job of jobs) {
        try {
          const res = await fetch("/api/admin/external-portals/import", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ portal: job.portal, solutionIds: job.solutionIds, customerNames: targetPortalNames }),
          });
          const data = await res.json();
          if (!res.ok) {
            errors.push(data.error || `Import from ${job.portal} failed.`);
            continue;
          }
          totalSolutions += data.importedSolutions || 0;
          totalCollaterals += data.importedCollaterals || 0;
          totalSkipped += data.skippedSolutions || 0;
        } catch {
          errors.push(`Import from ${job.portal} failed — server unreachable.`);
        }
      }

      await onImported();

      const summary = `Imported ${totalSolutions} solution(s) and ${totalCollaterals} linked collateral(s).` +
        (totalSkipped > 0 ? ` Skipped ${totalSkipped} duplicate(s).` : "");
      alert(errors.length > 0 ? `${summary}\n\n${errors.join("\n")}` : summary);

      setSelectedMobius(new Set());
      setSelectedTechmobius(new Set());
      setActiveImportModal(null);
    } finally {
      setImporting(false);
    }
  };

  // Maps solutions already sitting unmapped in the Hub Repository to whatever
  // portals are targeted — distinct from handleBulkImport above, which creates
  // brand-new solutions from an external source; this only updates existing ones
  // already in this hub.
  const handleMapHubRepoSelected = async () => {
    if (selectedHubRepo.size === 0) return;
    if (targetPortalNames.length === 0) {
      alert("Select at least one target portal before mapping Hub Repository solutions.");
      return;
    }
    setMappingHubRepo(true);
    try {
      for (const id of selectedHubRepo) {
        await onRefresh("update", { id, customerNames: targetPortalNames, customerName: targetPortalNames[0] || "" });
      }
      await onImported();
      alert(`Mapped ${selectedHubRepo.size} Hub Repository solution(s) to the selected portal(s).`);
      setSelectedHubRepo(new Set());
      setActiveImportModal(null);
    } finally {
      setMappingHubRepo(false);
    }
  };

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded uppercase tracking-wider inline-block">
          {title}
        </span>
        <div className="flex items-center gap-2">
          {(selectedMobius.size + selectedTechmobius.size) > 0 && (
            <button
              type="button"
              disabled={importing}
              onClick={handleBulkImport}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {importing
                ? "Importing…"
                : `Import ${selectedMobius.size + selectedTechmobius.size} Selected →`}
            </button>
          )}
          {selectedHubRepo.size > 0 && (
            <button
              type="button"
              disabled={mappingHubRepo}
              onClick={handleMapHubRepoSelected}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
              title={targetPortalNames.length === 0 ? "Select at least one target portal first" : undefined}
            >
              {mappingHubRepo
                ? "Mapping…"
                : `Map ${selectedHubRepo.size} Repository Selected →`}
            </button>
          )}
        </div>
      </div>

      {portalLoading ? (
        <p className="text-[11px] text-blue-500 animate-pulse">Fetching portal solutions…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Mobius Portal card */}
          <button
            type="button"
            onClick={() => setActiveImportModal("mobius")}
            className="relative bg-white rounded-lg border border-blue-100 px-3 py-3 text-left hover:border-blue-300 hover:shadow-2xs transition-all cursor-pointer"
          >
            <span className="text-xs font-bold text-slate-800 block">Mobius Portal</span>
            <span className="text-[10px] text-slate-400">{(portalSolutions?.mobius ?? []).length} solutions available</span>
            {selectedMobius.size > 0 && (
              <span className="absolute top-2 right-2 bg-blue-600 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
                {selectedMobius.size}
              </span>
            )}
          </button>

          {/* TechMobius Portal card */}
          <button
            type="button"
            onClick={() => setActiveImportModal("techmobius")}
            className="relative bg-white rounded-lg border border-blue-100 px-3 py-3 text-left hover:border-blue-300 hover:shadow-2xs transition-all cursor-pointer"
          >
            <span className="text-xs font-bold text-slate-800 block">TechMobius Portal</span>
            <span className="text-[10px] text-slate-400">{(portalSolutions?.techmobius ?? []).length} solutions available</span>
            {selectedTechmobius.size > 0 && (
              <span className="absolute top-2 right-2 bg-blue-600 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
                {selectedTechmobius.size}
              </span>
            )}
          </button>

          {/* Hub Repository card — to the right of TechMobius Portal */}
          <button
            type="button"
            onClick={() => setActiveImportModal("hubRepo")}
            className="relative bg-white rounded-lg border border-orange-150 px-3 py-3 text-left hover:border-orange-300 hover:shadow-2xs transition-all cursor-pointer"
          >
            <span className="text-xs font-bold text-slate-800 block">Hub Repository</span>
            <span className="text-[10px] text-slate-400">
              {repoSolutions.filter((s) => (!s.customerNames || s.customerNames.length === 0) && !s.customerName).length} unmapped solution(s)
            </span>
            {selectedHubRepo.size > 0 && (
              <span className="absolute top-2 right-2 bg-orange-600 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
                {selectedHubRepo.size}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Import source popup — Mobius / TechMobius / Hub Repository share one modal */}
      {activeImportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
          onClick={() => setActiveImportModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <span className="text-sm font-bold text-slate-900">
                {activeImportModal === "mobius"
                  ? "Mobius Portal Solutions"
                  : activeImportModal === "techmobius"
                    ? "TechMobius Portal Solutions"
                    : "Hub Repository — Unmapped Solutions"}
              </span>
              <button
                type="button"
                onClick={() => setActiveImportModal(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {(() => {
                if (activeImportModal === "hubRepo") {
                  const hubItems = repoSolutions.filter((s) => (!s.customerNames || s.customerNames.length === 0) && !s.customerName);
                  if (hubItems.length === 0) {
                    return <p className="px-4 py-6 text-center text-[11px] text-slate-400">No unmapped solutions in the Hub Repository.</p>;
                  }
                  return hubItems.map((sol) => {
                    const collateralCount = collaterals.filter((c) => c.linkedSolutionId === sol.id).length;
                    const checked = selectedHubRepo.has(sol.id);
                    return (
                      <label key={sol.id} className="flex items-start gap-2.5 px-4 py-2.5 cursor-pointer hover:bg-orange-50/50 transition-colors">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedHubRepo((prev) => {
                              const next = new Set(prev);
                              next.has(sol.id) ? next.delete(sol.id) : next.add(sol.id);
                              return next;
                            });
                          }}
                          className="mt-0.5 h-3.5 w-3.5 accent-orange-600 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate">{sol.title}</p>
                          <p className="text-[10px] text-slate-400">
                            {collateralCount} collateral{collateralCount !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </label>
                    );
                  });
                }

                const list = activeImportModal === "mobius" ? (portalSolutions?.mobius ?? []) : (portalSolutions?.techmobius ?? []);
                const selected = activeImportModal === "mobius" ? selectedMobius : selectedTechmobius;
                const setSelected = activeImportModal === "mobius" ? setSelectedMobius : setSelectedTechmobius;
                const existingTitles = new Set(solutions.map((s) => s.title.toLowerCase().trim()));

                if (list.length === 0) {
                  return <p className="px-4 py-6 text-center text-[11px] text-slate-400">Portal unreachable or no solutions found.</p>;
                }
                return list.map((sol) => {
                  const alreadyIn = existingTitles.has(sol.title.toLowerCase().trim());
                  const checked = selected.has(sol.id);
                  return (
                    <label
                      key={sol.id}
                      className={`flex items-start gap-2.5 px-4 py-2.5 cursor-pointer transition-colors ${alreadyIn ? "opacity-50 cursor-not-allowed bg-slate-50" : "hover:bg-blue-50/50"}`}
                    >
                      <input
                        type="checkbox"
                        disabled={alreadyIn}
                        checked={checked}
                        onChange={() => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            next.has(sol.id) ? next.delete(sol.id) : next.add(sol.id);
                            return next;
                          });
                        }}
                        className="mt-0.5 h-3.5 w-3.5 accent-blue-700 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{sol.title}</p>
                        <p className="text-[10px] text-slate-400">
                          {sol.collateralCount} collateral{sol.collateralCount !== 1 ? "s" : ""}
                          {alreadyIn && <span className="ml-1.5 text-amber-500 font-semibold">· already in hub</span>}
                        </p>
                      </div>
                    </label>
                  );
                });
              })()}
            </div>

            <div className="p-3 border-t border-slate-100 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setActiveImportModal(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
