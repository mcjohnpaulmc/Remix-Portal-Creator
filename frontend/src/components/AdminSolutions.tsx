/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Shield, Globe, Image, Tag, Key, FolderOpen, Link2, AlertCircle, Upload, X, ArrowLeft } from "lucide-react";
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

interface AdminSolutionsProps {
  solutions: Solution[];
  // Full, unfiltered solutions list for the Hub Repository picker and the
  // already-imported-title dedup check — callers should pass the same
  // unfiltered array for both `solutions` and this prop; kept separate for
  // backward compatibility with callers that still distinguish the two.
  hubRepositorySolutions?: Solution[];
  collaterals?: Collateral[];
  onRefresh: (action: string, solutionData: any) => Promise<void>;
  onReload?: () => Promise<void>;
  subdomains?: { id: string; name: string; displayName: string }[];
  prefilledSubdomain?: string | null;
  adminUserEmail?: string;
  // When provided, the form opens pre-filled to edit this solution instead of
  // creating a new one (the "Import from Portal" section is hidden in this mode).
  editingSolution?: Solution | null;
  // Called when Back/Close/Cancel is clicked, or after a successful submit —
  // this component is always rendered inside a popup by its callers now.
  onClose?: () => void;
}

// Crisp thumbnail recommendations
const VISUAL_PRESETS = [
  { label: "Dashboard", url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=800" },
  { label: "Sourcing", url: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=800" },
  { label: "Retail Tech", url: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=800" },
  { label: "Server Room", url: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&q=80&w=800" }
];

export function AdminSolutions({
  solutions,
  hubRepositorySolutions,
  collaterals = [],
  onRefresh,
  onReload,
  subdomains = [],
  prefilledSubdomain,
  adminUserEmail = "",
  editingSolution = null,
  onClose,
}: AdminSolutionsProps) {
  const repoSolutions = hubRepositorySolutions ?? solutions;
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [customerNames, setCustomerNames] = useState<string[]>(prefilledSubdomain ? [prefilledSubdomain] : ["all"]);
  const [title, setTitle] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [appUrl, setAppUrl] = useState("");
  const [credentialsDescription, setCredentialsDescription] = useState("");
  const [usernamePrefill, setUsernamePrefill] = useState("");
  const [passwordPrefill, setPasswordPrefill] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [googleDriveUrl, setGoogleDriveUrl] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; size: string; type: string; url?: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadTab, setUploadTab] = useState<"local" | "drive">("local");

  // Portal import state — Mobius/TechMobius/Hub Repository are each a "card" that
  // opens a shared popup listing that source's solutions; only one popup is open
  // at a time. Selections persist across opening/closing the popup so the card can
  // show a running count.
  const [portalSolutions, setPortalSolutions] = useState<{ mobius: ExternalSolution[]; techmobius: ExternalSolution[] } | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [selectedMobius, setSelectedMobius] = useState<Set<string>>(new Set());
  const [selectedTechmobius, setSelectedTechmobius] = useState<Set<string>>(new Set());
  const [selectedHubRepo, setSelectedHubRepo] = useState<Set<string>>(new Set());
  const [activeImportModal, setActiveImportModal] = useState<"mobius" | "techmobius" | "hubRepo" | null>(null);
  const [importing, setImporting] = useState(false);
  const [mappingHubRepo, setMappingHubRepo] = useState(false);

  React.useEffect(() => {
    if (portalSolutions === null && !portalLoading && !editingId) {
      loadPortalSolutions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  // Pre-fill the form for editing when a solution is handed in externally
  // (e.g. from the Map Solutions page's Edit action).
  React.useEffect(() => {
    if (editingSolution) {
      handleEditClick(editingSolution);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingSolution]);

  const resetForm = () => {
    setEditingId(null);
    setCustomerNames(prefilledSubdomain ? [prefilledSubdomain] : ["all"]);
    setTitle("");
    setThumbnail("");
    setAppUrl("");
    setCredentialsDescription("");
    setUsernamePrefill("");
    setPasswordPrefill("");
    setTagsInput("");
    setGoogleDriveUrl("");
    setUploadedFiles([]);
    setPortalSolutions(null);
    setSelectedMobius(new Set());
    setSelectedTechmobius(new Set());
    setSelectedHubRepo(new Set());
    setActiveImportModal(null);
  };

  const handleClose = () => {
    resetForm();
    onClose?.();
  };

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
            body: JSON.stringify({ portal: job.portal, solutionIds: job.solutionIds, customerNames }),
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

      // Both solutions and collaterals changed — refetch the full database rather
      // than patching local state, since this component only owns solutions state.
      await onReload?.();

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

  // Maps solutions already sitting unmapped in the Hub Repository (onboarded with
  // Step 1 left blank) to whatever portals are currently checked in Step 1 —
  // distinct from handleBulkImport above, which creates brand-new solutions from
  // an external source; this only updates existing ones already in this hub.
  const handleMapHubRepoSelected = async () => {
    if (selectedHubRepo.size === 0) return;
    if (customerNames.length === 0) {
      alert("Select at least one portal in Step 1 before mapping Hub Repository solutions.");
      return;
    }
    setMappingHubRepo(true);
    try {
      for (const id of selectedHubRepo) {
        await onRefresh("update", { id, customerNames, customerName: customerNames[0] });
      }
      await onReload?.();
      alert(`Mapped ${selectedHubRepo.size} Hub Repository solution(s) to the selected portal(s).`);
      setSelectedHubRepo(new Set());
      setActiveImportModal(null);
    } finally {
      setMappingHubRepo(false);
    }
  };

  const handleEditClick = (sol: Solution) => {
    setEditingId(sol.id);
    const names = sol.customerNames || (sol.customerName ? [sol.customerName] : []);
    setCustomerNames(names);
    setTitle(sol.title);
    setThumbnail(sol.thumbnail);
    setAppUrl(sol.url);
    setCredentialsDescription(sol.credentialsDescription);
    setUsernamePrefill(sol.usernamePrefill || "");
    setPasswordPrefill(sol.passwordPrefill || "");
    setTagsInput(sol.tags ? sol.tags.join(", ") : "");
    setGoogleDriveUrl((sol as any).googleDriveUrl || "");
    setUploadedFiles((sol as any).uploadedFiles || []);
  };

  const handleSubdomainCheckboxChange = (name: string) => {
    if (name === "all") {
      setCustomerNames(["all"]);
      return;
    }
    let updated = customerNames.filter((n) => n !== "all");
    if (updated.includes(name)) {
      updated = updated.filter((n) => n !== name);
    } else {
      updated.push(name);
    }
    // Deliberately no fallback to ["all"] when this becomes empty — leaving every
    // checkbox unchecked is a valid, intentional state: the solution is onboarded
    // to the Hub Repository only, not mapped to any live portal, until mapped
    // later via the Map Solutions page.
    setCustomerNames(updated);
  };

  const handleLocalFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const uploaded: typeof uploadedFiles = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const formData = new FormData();
      formData.append("file", f);
      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "X-Admin-User": adminUserEmail },
          body: formData,
        });
        const data = await res.json();
        uploaded.push({ name: f.name, size: `${(f.size / 1024).toFixed(1)} KB`, type: f.type, url: data.url });
      } catch {
        uploaded.push({ name: f.name, size: `${(f.size / 1024).toFixed(1)} KB`, type: f.type });
      }
    }
    setUploadedFiles(prev => [...prev, ...uploaded]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) {
      alert("Please enter a Solution Title.");
      return;
    }

    setSubmitting(true);
    const splitTags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const payload = {
      id: editingId || undefined,
      title,
      thumbnail,
      url: appUrl,
      credentialsDescription,
      usernamePrefill,
      passwordPrefill,
      tags: splitTags,
      // No "all" fallback: an empty selection means Step 1 was left unchecked on
      // purpose — onboard to the Hub Repository only, unmapped to any portal.
      customerName: customerNames[0] || "",
      customerNames,
      googleDriveUrl,
      uploadedFiles,
      enabled: editingId ? (solutions.find((s) => s.id === editingId)?.enabled !== false) : true,
    };

    try {
      await onRefresh(editingId ? "update" : "create", payload);
      handleClose();
    } catch (err) {
      alert("Execution error while trying to onboard solution.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div id="admin-solutions-view" className="space-y-6">
      <form onSubmit={handleSubmit} className="p-6 bg-white rounded-2xl border border-slate-100 shadow-xs space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="flex items-center gap-1 px-2 py-1 -ml-2 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-lg transition-colors"
              title="Back"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              {editingId ? "Edit Solution Resource" : "Onboard New Utility"}
            </span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Target Subdomain Checkboxes — STEP 1 */}
          <div className="md:col-span-2 space-y-2">
            <span className="text-[10px] font-mono font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded uppercase tracking-wider inline-block">
              📍 STEP 1: Select Target Subdomains (Multi-Select Enabled)
            </span>
            <label className="block text-xs font-semibold text-slate-500">
              Linked Customer Subdomain Portals (Asset will list under selected portals)
            </label>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 md:grid-cols-3 gap-2.5">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={customerNames.includes("all")}
                  onChange={() => handleSubdomainCheckboxChange("all")}
                  className="h-3.5 w-3.5 accent-orange-600 rounded border-slate-350"
                />
                <span className="text-slate-900 font-mono font-bold">All (Global Asset)</span>
              </label>
              {subdomains.map((sub) => (
                <label key={sub.id} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={customerNames.includes(sub.name)}
                    onChange={() => handleSubdomainCheckboxChange(sub.name)}
                    className="h-3.5 w-3.5 accent-orange-600 rounded border-slate-350"
                  />
                  <span className="text-slate-700 font-mono text-[11px]">{sub.displayName} ({sub.name})</span>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed flex items-start gap-1.5">
              <AlertCircle className="h-3 w-3 text-slate-350 shrink-0 mt-0.5" />
              Leaving every box unchecked onboards this solution to the <strong className="text-slate-500 font-semibold">Hub Repository</strong> only —
              it won't appear on any live portal until mapped later from the Map Solutions page.
            </p>
          </div>

          {/* ── Portal Import Section (only shown when creating, not editing) ── */}
          {!editingId && (
            <div className="md:col-span-2 rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded uppercase tracking-wider inline-block">
                  🔗 Import from Portal (optional)
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
                      title={customerNames.length === 0 ? "Select at least one portal in Step 1 first" : undefined}
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

              <div className="flex items-center gap-2 pt-1">
                <div className="flex-1 border-t border-blue-100" />
                <span className="text-[10px] text-slate-400 font-medium shrink-0">— or fill in manually below —</span>
                <div className="flex-1 border-t border-blue-100" />
              </div>
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

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Solution Name / Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="E.g., Mobius Supply Chain Tracker"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-slate-800"
              required
            />
          </div>

          {/* URL */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
              <Globe className="h-3 w-3" /> Application URL <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="url"
              value={appUrl}
              onChange={(e) => setAppUrl(e.target.value)}
              placeholder="https://dashboard.mobiusservices.io or http://localhost:8080"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-slate-800"
            />
          </div>

          {/* Thumbnail Upload Redesign */}
          <div className="md:col-span-2 space-y-3">
            <label className="block text-xs font-semibold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider text-[11px] font-mono">
              <Image className="h-4 w-4 text-orange-500" /> Visual Card Thumbnail Setup
              <span className="text-slate-400 normal-case font-sans font-normal tracking-normal">(optional)</span>
            </label>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Visual Preview area */}
              <div className="md:col-span-4 flex flex-col justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl min-h-[140px] items-center text-center">
                <span className="text-[10px] uppercase font-mono font-bold text-slate-400 block mb-2 tracking-wider">Live Thumbnail Preview</span>
                {thumbnail ? (
                  <div className="relative group w-full max-w-[150px] aspect-video rounded-lg overflow-hidden border border-slate-200 shadow-xs">
                    <img
                      src={thumbnail}
                      alt="Thumbnail live preview"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <button
                      type="button"
                      onClick={() => setThumbnail("")}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[11px] font-bold gap-1 cursor-pointer"
                    >
                      Reset Image
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-2 text-slate-400">
                    <Image className="h-8 w-8 stroke-1 text-slate-300 mb-1" />
                    <span className="text-[10px] font-medium">No image selected or uploaded yet</span>
                  </div>
                )}
                {thumbnail && (
                  <span className="text-[9px] font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full mt-2 font-bold uppercase tracking-wider">
                    {thumbnail.startsWith("data:") ? "Uploaded from Computer" : "Remote / Preset Image"}
                  </span>
                )}
              </div>

              {/* Upload & Choose Input area */}
              <div className="md:col-span-8 flex flex-col justify-center space-y-3">
                <div
                  onClick={() => document.getElementById("solution-thumbnail-input")?.click()}
                  className="border-2 border-dashed border-slate-200 hover:border-slate-400 bg-white hover:bg-slate-50/50 rounded-xl p-5 text-center cursor-pointer transition-all duration-150 group"
                >
                  <input
                    type="file"
                    id="solution-thumbnail-input"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const formData = new FormData();
                        formData.append("file", file);
                        try {
                          const res = await fetch("/api/upload", {
                            method: "POST",
                            headers: { "X-Admin-User": adminUserEmail },
                            body: formData,
                          });
                          const data = await res.json();
                          if (data.url) setThumbnail(data.url);
                        } catch {
                          console.error("Thumbnail upload failed");
                        }
                      }
                    }}
                    className="hidden"
                  />
                  <Upload className="h-6 w-6 text-slate-400 group-hover:text-slate-600 mx-auto mb-2 transition-colors duration-150" />
                  <p className="text-xs text-slate-700 font-bold font-sans">Upload image from local computer</p>
                  <p className="text-[10px] text-slate-400 mt-1">Accepts PNG, JPG, JPEG, WEBP or GIF (Will convert to fast-loading static reference asset)</p>
                </div>

                {/* Preset and URL toggle options */}
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/20 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                    <span>Or, select premium presets:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {VISUAL_PRESETS.map((preset, pIdx) => (
                      <button
                        key={pIdx}
                        type="button"
                        onClick={() => setThumbnail(preset.url)}
                        className={`text-[10px] font-medium px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                          thumbnail === preset.url
                            ? "bg-slate-900 border-transparent text-white shadow-xs"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
              <Tag className="h-3 w-3" /> Tag Categories (comma separated)
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="Computer Vision, Logistics, Real-time"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-slate-800"
            />
          </div>

          {/* Credentials Description */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
              <Shield className="h-3 w-3" /> Credentials Instruction / Context
            </label>
            <input
              type="text"
              value={credentialsDescription}
              onChange={(e) => setCredentialsDescription(e.target.value)}
              placeholder="E.g., Authorized guest credentials. Admin bypass active."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-slate-800"
            />
          </div>

          {/* Username Prefill */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
              <Key className="h-3 w-3" /> Username prefill (Optional)
            </label>
            <input
              type="text"
              value={usernamePrefill}
              onChange={(e) => setUsernamePrefill(e.target.value)}
              placeholder="ops@client.com"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-slate-800"
            />
          </div>

          {/* Password Prefill */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
              <Key className="h-3 w-3" /> Password prefill (Optional)
            </label>
            <input
              type="text"
              value={passwordPrefill}
              onChange={(e) => setPasswordPrefill(e.target.value)}
              placeholder="AuthorizedPass2026!"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-slate-800"
            />
          </div>

          {/* Custom Dual Upload Shelf */}
          <div className="md:col-span-2 space-y-2 border-t border-slate-100 pt-4">
            <span className="text-[10px] font-mono font-bold text-teal-650 bg-teal-50 px-2 py-0.5 rounded uppercase tracking-wider inline-block">
              📂 CONNECT SUPPORTING ARCHITECTURE (DUAL INGESTION)
            </span>
            <label className="block text-xs font-semibold text-slate-500">
              Attach Supporting Deliverables or Resource folders
            </label>

            {/* Tab Selector */}
            <div className="flex gap-2 border-b border-slate-200 pb-2">
              <button
                type="button"
                onClick={() => setUploadTab("local")}
                className={`text-xs font-semibold px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                  uploadTab === "local" ? "bg-slate-900 text-white shadow-3xs" : "bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                <FolderOpen className="h-3.5 w-3.5" /> Local Computer File
              </button>
              <button
                type="button"
                onClick={() => setUploadTab("drive")}
                className={`text-xs font-semibold px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                  uploadTab === "drive" ? "bg-slate-900 text-white shadow-3xs" : "bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                <Link2 className="h-3.5 w-3.5" /> Google Drive Link URL
              </button>
            </div>

            {/* Dynamic Inner Panel */}
            <div className="bg-slate-50/70 p-4 rounded-xl border border-dashed border-slate-200 text-left">
              {uploadTab === "local" ? (
                <div className="space-y-3">
                  <div className="flex flex-col items-center justify-center p-4 bg-white rounded-lg border border-slate-200 text-center hover:bg-slate-50 transition-colors pointer-events-auto relative">
                    <input
                      type="file"
                      multiple
                      onChange={handleLocalFileUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <FolderOpen className="h-6 w-6 text-slate-400 mb-1.5" />
                    <span className="text-xs font-semibold text-slate-700">Drag & Drop or Click to Upload</span>
                    <span className="text-[10px] text-slate-450 mt-0.5">PDF, DOC, XLS, PNG, ZIP</span>
                  </div>

                  {uploadedFiles.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] uppercase font-mono font-bold text-slate-400">Successfully Uploaded ({uploadedFiles.length})</span>
                      <div className="max-h-24 overflow-y-auto space-y-1">
                        {uploadedFiles.map((f, fIdx) => (
                          <div key={fIdx} className="flex justify-between items-center bg-white p-1.5 rounded px-2.5 text-[10px] font-mono border border-slate-150">
                            <span className="text-slate-750 truncate max-w-[200px]">{f.name}</span>
                            <span className="text-slate-400 shrink-0">{f.size}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-[11px] font-medium text-slate-500">Google Drive / Shared Link URL</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={googleDriveUrl}
                      onChange={(e) => setGoogleDriveUrl(e.target.value)}
                      placeholder="https://drive.google.com/drive/folders/your-shared-folder-id"
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-hidden"
                    />
                    {googleDriveUrl && (
                      <span className="bg-emerald-50 text-emerald-600 border border-emerald-150 px-2.5 text-[10px] font-bold uppercase rounded-md self-center py-1">Linked</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3.5">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 border border-slate-200 hover:border-slate-350 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting ? "Saving changes..." : editingId ? "Apply Modifications" : "Launch Solution"}
          </button>
        </div>
      </form>
    </div>
  );
}
