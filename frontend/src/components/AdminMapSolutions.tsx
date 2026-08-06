/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { X, Eye, EyeOff, Edit2, Trash2, LayoutGrid, Link2, RefreshCw } from "lucide-react";
import { Solution, Collateral, SubdomainPortal } from "../../../shared/types";
import { SafeImage } from "./SafeImage";
import { AdminSolutions } from "./AdminSolutions";

interface AdminMapSolutionsProps {
  solutions: Solution[];
  collaterals?: Collateral[];
  subdomains: SubdomainPortal[];
  onRefresh: (action: string, solutionData: any) => Promise<void>;
  onReload?: () => Promise<void>;
  adminUserEmail?: string;
}

interface PortalRow {
  id: string;
  name: string; // "" for the synthetic unmapped row
  displayName: string;
  isUnmapped?: boolean;
}

function namesOf(sol: Solution): string[] {
  return sol.customerNames || (sol.customerName ? [sol.customerName] : []);
}

function solutionsForPortal(solutions: Solution[], row: PortalRow): Solution[] {
  if (row.isUnmapped) {
    return solutions.filter((s) => namesOf(s).length === 0);
  }
  return solutions.filter((s) => {
    const names = namesOf(s);
    return names.includes(row.name) || names.includes("all");
  });
}

export function AdminMapSolutions({
  solutions,
  collaterals = [],
  subdomains,
  onRefresh,
  onReload,
  adminUserEmail = "",
}: AdminMapSolutionsProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [viewPortal, setViewPortal] = useState<PortalRow | null>(null);
  const [mapPortal, setMapPortal] = useState<PortalRow | null>(null);
  const [selectedToMap, setSelectedToMap] = useState<Set<string>>(new Set());
  const [mapping, setMapping] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editingSolution, setEditingSolution] = useState<Solution | null>(null);

  const subdomainProp = subdomains.map((s) => ({ id: s.id, name: s.name, displayName: s.displayName }));

  const rows: PortalRow[] = [
    ...subdomains.map((s) => ({ id: s.id, name: s.name, displayName: s.displayName })),
    { id: "__unmapped__", name: "", displayName: "Hub Repository (Unmapped)", isUnmapped: true },
  ];

  const openMap = (row: PortalRow) => {
    setSelectedToMap(new Set());
    setMapPortal(row);
  };

  const handleToggleEnable = async (sol: Solution) => {
    if (togglingId) return;
    setTogglingId(sol.id);
    try {
      await onRefresh("update", { ...sol, enabled: sol.enabled !== false ? false : true });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (sol: Solution) => {
    if (!confirm(`Delete solution "${sol.title}"? This cannot be undone.`)) return;
    await onRefresh("delete", { id: sol.id });
  };

  const handleMapSelected = async () => {
    if (!mapPortal || selectedToMap.size === 0) return;
    setMapping(true);
    try {
      for (const id of selectedToMap) {
        const sol = solutions.find((s) => s.id === id);
        if (!sol) continue;
        const existing = namesOf(sol).filter((n) => n !== "all");
        const updated = existing.includes(mapPortal.name) ? existing : [...existing, mapPortal.name];
        await onRefresh("update", { ...sol, customerNames: updated, customerName: updated[0] || "" });
      }
      await onReload?.();
      setSelectedToMap(new Set());
      setMapPortal(null);
    } finally {
      setMapping(false);
    }
  };

  const candidateSolutions = mapPortal
    ? solutions.filter((s) => {
        const names = namesOf(s);
        return !names.includes(mapPortal.name) && !names.includes("all");
      })
    : [];

  return (
    <div id="admin-map-solutions-view" className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-base font-bold text-slate-900 leading-tight">
            Map Solutions
          </h3>
          <p className="text-xs text-slate-500">
            Every customer portal, one row each — view what's mapped or map new solutions in.
          </p>
        </div>
        {onReload && (
          <button
            onClick={async () => {
              setRefreshing(true);
              try { await onReload(); } finally { setRefreshing(false); }
            }}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 self-start md:self-auto"
            title="Reload solutions from server"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        )}
      </div>

      <div className="space-y-4">
        {rows.map((row) => {
          const rowSolutions = solutionsForPortal(solutions, row);
          return (
            <div key={row.id} className="bg-white rounded-2xl border border-slate-100 shadow-2xs p-4">
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <h4 className={`font-bold text-sm truncate ${row.isUnmapped ? "text-slate-500" : "text-slate-900"}`}>
                    {row.displayName}
                  </h4>
                  <span className="text-[10px] text-slate-400 font-mono shrink-0">
                    {rowSolutions.length} solution{rowSolutions.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setViewPortal(row)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold rounded-lg transition-colors"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" /> View
                  </button>
                  {!row.isUnmapped && (
                    <button
                      type="button"
                      onClick={() => openMap(row)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-semibold rounded-lg transition-colors"
                    >
                      <Link2 className="h-3.5 w-3.5" /> Map Solution
                    </button>
                  )}
                </div>
              </div>

              {rowSolutions.length === 0 ? (
                <div className="text-center py-4 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-[11px] text-slate-400 font-mono">No solutions mapped here yet.</p>
                </div>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-1 custom-scroll">
                  {rowSolutions.map((sol) => (
                    <div
                      key={sol.id}
                      className="shrink-0 w-40 bg-slate-50 rounded-xl border border-slate-150 overflow-hidden"
                    >
                      <div className="h-20 w-full bg-white relative border-b border-slate-100">
                        <SafeImage src={sol.thumbnail} alt={sol.title} title={sol.title} className="w-full h-full object-cover" />
                      </div>
                      <p className="text-[10.5px] font-semibold text-slate-800 px-2 py-1.5 truncate" title={sol.title}>
                        {sol.title}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* View popup — expanded portal card, 2-column grid, existing hide/edit/delete actions */}
      {viewPortal && (() => {
        const rowSolutions = solutionsForPortal(solutions, viewPortal);
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setViewPortal(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                <span className="text-sm font-bold text-slate-900">{viewPortal.displayName} — Mapped Solutions</span>
                <div className="flex items-center gap-2">
                  {!viewPortal.isUnmapped && (
                    <button
                      type="button"
                      onClick={() => { const p = viewPortal; setViewPortal(null); openMap(p); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-semibold rounded-lg transition-colors"
                    >
                      <Link2 className="h-3.5 w-3.5" /> Map Solution
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setViewPortal(null)}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                    title="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {rowSolutions.map((sol) => {
                    const isEnabled = sol.enabled !== false;
                    const isToggling = togglingId === sol.id;
                    return (
                      <div
                        key={sol.id}
                        className={`flex gap-4 p-4.5 bg-white rounded-2xl border transition-all relative overflow-hidden group ${
                          !isEnabled ? "border-slate-200 bg-slate-50/50 opacity-80" : "border-slate-100 hover:border-slate-200 hover:shadow-2xs"
                        }`}
                      >
                        <div className="h-20 w-28 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 shrink-0 relative">
                          <SafeImage src={sol.thumbnail} alt={sol.title} title={sol.title} className="w-full h-full object-cover" />
                        </div>

                        <div className="flex-1 min-w-0 flex flex-col justify-between text-left">
                          <div>
                            <h4 className="font-display font-semibold text-xs text-slate-900 uppercase tracking-wide truncate flex items-center gap-1.5">
                              <span className="truncate">{sol.title}</span>
                              {isToggling ? (
                                <span className="shrink-0 text-[8px] bg-slate-100 text-slate-400 border border-slate-200 px-1 py-0.5 rounded-sm uppercase tracking-wide font-semibold font-sans animate-pulse">
                                  Updating…
                                </span>
                              ) : !isEnabled ? (
                                <span className="shrink-0 text-[8px] bg-amber-50 text-amber-600 border border-amber-200 px-1 py-0.5 rounded-sm uppercase tracking-wide font-semibold font-sans">
                                  Hidden
                                </span>
                              ) : (
                                <span className="shrink-0 text-[8px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-1 py-0.5 rounded-sm uppercase tracking-wide font-semibold font-sans">
                                  Visible
                                </span>
                              )}
                            </h4>
                            <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5">Path: {sol.url}</p>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {sol.tags && sol.tags.map((tag, tagIdx) => (
                                <span key={tagIdx} className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded-sm text-slate-500 font-medium">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="pt-2 text-[10px] text-slate-400 font-mono">
                            Guest: {sol.usernamePrefill ? "Encrypted" : "None"}
                          </div>
                        </div>

                        <div className="flex flex-col justify-between items-end shrink-0 self-stretch">
                          <div className="flex flex-col gap-1.5 items-end">
                            <button
                              type="button"
                              onClick={() => handleToggleEnable(sol)}
                              disabled={isToggling}
                              className={`flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-semibold transition-all whitespace-nowrap ${
                                !isEnabled
                                  ? "bg-emerald-50 border-emerald-200 hover:bg-emerald-100 text-emerald-700 font-sans"
                                  : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700 font-sans"
                              }`}
                              title={!isEnabled ? "Show on User View" : "Hide from User View"}
                            >
                              {!isEnabled ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                              <span>{!isEnabled ? "Show" : "Hide"}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => { setViewPortal(null); setEditingSolution(sol); }}
                              className="flex items-center gap-1 px-2 py-1 border border-slate-200 rounded bg-slate-50 hover:bg-slate-100 text-slate-600 text-[10px] font-semibold transition-colors font-sans"
                              title="Edit Solution"
                            >
                              <Edit2 className="h-3 w-3" />
                              <span>Edit</span>
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDelete(sol)}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-200 rounded transition-colors"
                            title="Delete solution"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {rowSolutions.length === 0 && (
                    <div className="md:col-span-2 text-center p-8 bg-slate-50 rounded-2xl border border-slate-150">
                      <p className="text-xs text-slate-400 font-mono">No solutions mapped here yet.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Map Solution popup — pick solutions to map into mapPortal */}
      {mapPortal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
          onClick={() => setMapPortal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <span className="text-sm font-bold text-slate-900">Map Solutions to {mapPortal.displayName}</span>
              <button type="button" onClick={() => setMapPortal(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {candidateSolutions.length === 0 ? (
                <p className="px-4 py-6 text-center text-[11px] text-slate-400">No unmapped solutions available to map.</p>
              ) : (
                candidateSolutions.map((sol) => {
                  const collateralCount = collaterals.filter((c) => c.linkedSolutionId === sol.id).length;
                  const checked = selectedToMap.has(sol.id);
                  return (
                    <label key={sol.id} className="flex items-start gap-2.5 px-4 py-2.5 cursor-pointer hover:bg-orange-50/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedToMap((prev) => {
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
                })
              )}
            </div>

            <div className="p-3 border-t border-slate-100 flex justify-end shrink-0">
              <button
                type="button"
                disabled={selectedToMap.size === 0 || mapping}
                onClick={handleMapSelected}
                className="px-5 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
              >
                {mapping ? "Mapping…" : `Map ${selectedToMap.size} Selected`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit popup — reuses the onboarding form component in edit mode */}
      {editingSolution && (
        <div
          className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-xs flex items-start md:items-center justify-center p-4 overflow-y-auto"
          onClick={() => setEditingSolution(null)}
        >
          <div className="w-full max-w-3xl my-8" onClick={(e) => e.stopPropagation()}>
            <AdminSolutions
              solutions={solutions}
              hubRepositorySolutions={solutions}
              collaterals={collaterals}
              subdomains={subdomainProp}
              onRefresh={onRefresh}
              onReload={onReload}
              adminUserEmail={adminUserEmail}
              editingSolution={editingSolution}
              onClose={() => setEditingSolution(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
