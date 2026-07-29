/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Plus, Edit2, Check, X, Shield, Globe, Image, Tag, Key, Eye, EyeOff, FolderOpen, Link2, Download, AlertCircle, Upload, Trash2, RefreshCw, ChevronDown, ChevronRight, Rocket, FileCode } from "lucide-react";
import { Solution } from "../../../shared/types";
import { SafeImage } from "./SafeImage";

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
  onRefresh: (action: string, solutionData: any) => Promise<void>;
  onReload?: () => Promise<void>;
  subdomains?: { id: string; name: string; displayName: string }[];
  prefilledSubdomain?: string | null;
  adminUserEmail?: string;
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
  onRefresh,
  onReload,
  subdomains = [],
  prefilledSubdomain,
  adminUserEmail = "",
}: AdminSolutionsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Form states
  const [customerNames, setCustomerNames] = useState<string[]>(["all"]);
  const [customerName, setCustomerName] = useState("all");
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

  // Portal import state
  const [portalSolutions, setPortalSolutions] = useState<{ mobius: ExternalSolution[]; techmobius: ExternalSolution[] } | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [selectedMobius, setSelectedMobius] = useState<Set<string>>(new Set());
  const [selectedTechmobius, setSelectedTechmobius] = useState<Set<string>>(new Set());
  const [mobiusOpen, setMobiusOpen] = useState(false);
  const [techMobiusOpen, setTechMobiusOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  // Deploy Solution (standalone HTML app) state — independent of the manual
  // onboarding form above, since it drives a completely different server flow
  // (file upload + subdomain provisioning instead of a plain URL link-out).
  const [deployPanelOpen, setDeployPanelOpen] = useState(false);
  const [deployFile, setDeployFile] = useState<File | null>(null);
  const [deployTitle, setDeployTitle] = useState("");
  const [deploySlug, setDeploySlug] = useState("");
  const [deployCustomerNames, setDeployCustomerNames] = useState<string[]>(["all"]);
  const [deploySubmitting, setDeploySubmitting] = useState(false);
  const [deployError, setDeployError] = useState("");

  React.useEffect(() => {
    if (prefilledSubdomain) {
      setCustomerNames([prefilledSubdomain]);
      setCustomerName(prefilledSubdomain);
    }
  }, [prefilledSubdomain]);

  React.useEffect(() => {
    if (isEditing && !editingId && portalSolutions === null && !portalLoading) {
      loadPortalSolutions();
    }
  }, [isEditing, editingId]);

  const resetForm = () => {
    setIsEditing(false);
    setEditingId(null);
    // Re-seed from prefilledSubdomain (e.g. "Onboard Assets for this Portal") rather
    // than hardcoding "all" — otherwise opening the form after arriving scoped to a
    // specific portal silently discarded that scope, and a single click of "Onboard
    // New Solution" would default the mapping to every portal (including future
    // ones) instead of just the portal the admin was actually working in.
    setCustomerNames(prefilledSubdomain ? [prefilledSubdomain] : ["all"]);
    setCustomerName(prefilledSubdomain || "all");
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
    setMobiusOpen(false);
    setTechMobiusOpen(false);
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
      setMobiusOpen(false);
      setTechMobiusOpen(false);
    } finally {
      setImporting(false);
    }
  };

  const resetDeployForm = () => {
    setDeployPanelOpen(false);
    setDeployFile(null);
    setDeployTitle("");
    setDeploySlug("");
    setDeployCustomerNames(prefilledSubdomain ? [prefilledSubdomain] : ["all"]);
    setDeployError("");
  };

  const handleDeployCustomerCheckboxChange = (name: string) => {
    if (name === "all") {
      setDeployCustomerNames(["all"]);
      return;
    }
    let updated = deployCustomerNames.filter((n) => n !== "all");
    if (updated.includes(name)) {
      updated = updated.filter((n) => n !== name);
    } else {
      updated.push(name);
    }
    if (updated.length === 0) updated = ["all"];
    setDeployCustomerNames(updated);
  };

  // Uploads a standalone HTML app, provisions it its own subdomain server-side
  // (DNS record + static IIS site), and creates a Solution card pointing at that
  // subdomain — clicking the card on a mapped portal opens the deployed app.
  const handleDeploySolution = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeployError("");
    if (!deployFile || !deployTitle.trim() || !deploySlug.trim()) {
      setDeployError("HTML file, title, and subdomain are all required.");
      return;
    }
    setDeploySubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", deployFile);
      formData.append("title", deployTitle.trim());
      formData.append("subdomain", deploySlug.trim());
      formData.append("customerNames", JSON.stringify(deployCustomerNames));
      const res = await fetch("/api/admin/deploy-solution", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setDeployError(data.error || "Deployment failed.");
        return;
      }
      await onReload?.();
      alert(`Deployed "${deployTitle.trim()}" at ${data.url || `${deploySlug.trim()}.mobiusservices.io`}`);
      resetDeployForm();
    } catch {
      setDeployError("Network error. Try again.");
    } finally {
      setDeploySubmitting(false);
    }
  };

  const handleEditClick = (sol: Solution) => {
    setEditingId(sol.id);
    const names = sol.customerNames || (sol.customerName ? [sol.customerName] : ["all"]);
    setCustomerNames(names);
    setCustomerName(names[0] || "all");
    setTitle(sol.title);
    setThumbnail(sol.thumbnail);
    setAppUrl(sol.url);
    setCredentialsDescription(sol.credentialsDescription);
    setUsernamePrefill(sol.usernamePrefill || "");
    setPasswordPrefill(sol.passwordPrefill || "");
    setTagsInput(sol.tags ? sol.tags.join(", ") : "");
    setGoogleDriveUrl((sol as any).googleDriveUrl || "");
    setUploadedFiles((sol as any).uploadedFiles || []);
    setIsEditing(true);
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
    if (updated.length === 0) {
      updated = ["all"];
    }
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
    if (!title || !thumbnail) {
      alert("Please complete all primary fields (Title, Visual Thumbnail).");
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
      customerName: customerNames[0] || "all",
      customerNames,
      googleDriveUrl,
      uploadedFiles,
      enabled: editingId ? (solutions.find((s) => s.id === editingId)?.enabled !== false) : true,
    };

    try {
      await onRefresh(editingId ? "update" : "create", payload);
      resetForm();
    } catch (err) {
      alert("Execution error while trying to onboard solution.");
    } finally {
      setSubmitting(false);
    }
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

  return (
    <div id="admin-solutions-view" className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-base font-bold text-slate-900 leading-tight">
            Solution Onboarding Matrix
          </h3>
          <p className="text-xs text-slate-500">
            Provision active cloud systems, set copyable guest keys, and map custom tag indices.
          </p>
        </div>

        {!isEditing && !deployPanelOpen && (
          <div className="flex items-center gap-2">
            {onReload && (
              <button
                onClick={async () => {
                  setRefreshing(true);
                  try { await onReload(); } finally { setRefreshing(false); }
                }}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                title="Reload solutions from server"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            )}
            <button
              onClick={() => {
                resetForm();
                setIsEditing(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" />
              Onboard New Solution
            </button>
            <button
              onClick={() => {
                resetDeployForm();
                setDeployPanelOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold rounded-lg transition-colors"
              title="Upload a standalone HTML app and host it on its own subdomain"
            >
              <Rocket className="h-4 w-4" />
              Deploy Solution
            </button>
          </div>
        )}
      </div>

      {deployPanelOpen && (
        <form onSubmit={handleDeploySolution} className="p-6 bg-white rounded-2xl border border-slate-100 shadow-xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Rocket className="h-3.5 w-3.5 text-orange-500" />
              Deploy Standalone HTML App
            </span>
            <button type="button" onClick={resetDeployForm} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-slate-500 -mt-2">
            Upload a single self-contained HTML file (the entire app bundled inline). It's hosted on the server and
            assigned its own subdomain — the Solution card created below will open that subdomain when clicked.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Standalone HTML File</label>
              <label className="flex items-center gap-2 px-3 py-2.5 border border-dashed border-slate-300 rounded-lg text-xs text-slate-600 hover:border-orange-400 hover:bg-orange-50/30 transition-colors cursor-pointer">
                <FileCode className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="truncate">{deployFile ? deployFile.name : "Choose a .html file…"}</span>
                <input
                  type="file"
                  accept=".html,.htm,text/html"
                  className="hidden"
                  onChange={(e) => setDeployFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Solution Title</label>
              <input
                type="text"
                value={deployTitle}
                onChange={(e) => setDeployTitle(e.target.value)}
                placeholder="e.g. Inventory Forecasting App"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Subdomain Name</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={deploySlug}
                  onChange={(e) => setDeploySlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="my-app"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <span className="text-xs text-slate-400 font-mono whitespace-nowrap">.mobiusservices.io</span>
              </div>
            </div>

            <div className="md:col-span-2 space-y-2">
              <label className="block text-xs font-semibold text-slate-500">Target Subdomain Portals (Multi-Select)</label>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 md:grid-cols-3 gap-2.5">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={deployCustomerNames.includes("all")}
                    onChange={() => handleDeployCustomerCheckboxChange("all")}
                    className="h-3.5 w-3.5 accent-orange-600 rounded border-slate-350"
                  />
                  <span className="text-slate-900 font-mono font-bold">All (Global Asset)</span>
                </label>
                {subdomains.map((sub) => (
                  <label key={sub.id} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={deployCustomerNames.includes(sub.name)}
                      onChange={() => handleDeployCustomerCheckboxChange(sub.name)}
                      className="h-3.5 w-3.5 accent-orange-600 rounded border-slate-350"
                    />
                    <span className="text-slate-700 font-mono text-[11px]">{sub.displayName} ({sub.name})</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {deployError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {deployError}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
            <button
              type="submit"
              disabled={deploySubmitting}
              className="px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs rounded-lg shadow-md transition-all cursor-pointer font-sans uppercase tracking-wider disabled:opacity-50 flex items-center gap-2"
            >
              <Rocket className="h-3.5 w-3.5" />
              {deploySubmitting ? "Deploying…" : "Deploy"}
            </button>
            <button
              type="button"
              onClick={resetDeployForm}
              className="px-4 py-2 border border-slate-250 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {isEditing && (
        <form onSubmit={handleSubmit} className="p-6 bg-white rounded-2xl border border-slate-100 shadow-xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              {editingId ? "Edit Solution Resource" : "Onboard New Utility"}
            </span>
            <button
              type="button"
              onClick={resetForm}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* ── Portal Import Section (only shown when creating, not editing) ── */}
          {!editingId && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded uppercase tracking-wider inline-block">
                  🔗 Import from Portal (optional)
                </span>
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
              </div>

              {portalLoading ? (
                <p className="text-[11px] text-blue-500 animate-pulse">Fetching portal solutions…</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Mobius Portal dropdown */}
                  {(() => {
                    const list = portalSolutions?.mobius ?? [];
                    const existingTitles = new Set(solutions.map(s => s.title.toLowerCase().trim()));
                    return (
                      <div className="bg-white rounded-lg border border-blue-100 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setMobiusOpen(o => !o)}
                          className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                        >
                          <span className="text-xs font-bold text-slate-800">
                            Mobius Portal
                            <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                              ({list.length} solutions{selectedMobius.size > 0 ? `, ${selectedMobius.size} selected` : ""})
                            </span>
                          </span>
                          {mobiusOpen ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                        </button>
                        {mobiusOpen && (
                          <div className="max-h-48 overflow-y-auto border-t border-slate-100 divide-y divide-slate-50">
                            {list.length === 0 ? (
                              <p className="px-3 py-3 text-[11px] text-slate-400">Portal unreachable or no solutions found.</p>
                            ) : list.map(sol => {
                              const alreadyIn = existingTitles.has(sol.title.toLowerCase().trim());
                              const checked = selectedMobius.has(sol.id);
                              return (
                                <label
                                  key={sol.id}
                                  className={`flex items-start gap-2.5 px-3 py-2 cursor-pointer transition-colors ${alreadyIn ? "opacity-50 cursor-not-allowed bg-slate-50" : "hover:bg-blue-50/50"}`}
                                >
                                  <input
                                    type="checkbox"
                                    disabled={alreadyIn}
                                    checked={checked}
                                    onChange={() => {
                                      setSelectedMobius(prev => {
                                        const next = new Set(prev);
                                        next.has(sol.id) ? next.delete(sol.id) : next.add(sol.id);
                                        return next;
                                      });
                                    }}
                                    className="mt-0.5 h-3.5 w-3.5 accent-blue-700 shrink-0"
                                  />
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-semibold text-slate-800 truncate">{sol.title}</p>
                                    <p className="text-[10px] text-slate-400">
                                      {sol.collateralCount} collateral{sol.collateralCount !== 1 ? "s" : ""}
                                      {alreadyIn && <span className="ml-1.5 text-amber-500 font-semibold">· already in hub</span>}
                                    </p>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Techmobius Portal dropdown */}
                  {(() => {
                    const list = portalSolutions?.techmobius ?? [];
                    const existingTitles = new Set(solutions.map(s => s.title.toLowerCase().trim()));
                    return (
                      <div className="bg-white rounded-lg border border-blue-100 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setTechMobiusOpen(o => !o)}
                          className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                        >
                          <span className="text-xs font-bold text-slate-800">
                            Techmobius Portal
                            <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                              ({list.length} solutions{selectedTechmobius.size > 0 ? `, ${selectedTechmobius.size} selected` : ""})
                            </span>
                          </span>
                          {techMobiusOpen ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                        </button>
                        {techMobiusOpen && (
                          <div className="max-h-48 overflow-y-auto border-t border-slate-100 divide-y divide-slate-50">
                            {list.length === 0 ? (
                              <p className="px-3 py-3 text-[11px] text-slate-400">Portal unreachable or no solutions found.</p>
                            ) : list.map(sol => {
                              const alreadyIn = existingTitles.has(sol.title.toLowerCase().trim());
                              const checked = selectedTechmobius.has(sol.id);
                              return (
                                <label
                                  key={sol.id}
                                  className={`flex items-start gap-2.5 px-3 py-2 cursor-pointer transition-colors ${alreadyIn ? "opacity-50 cursor-not-allowed bg-slate-50" : "hover:bg-blue-50/50"}`}
                                >
                                  <input
                                    type="checkbox"
                                    disabled={alreadyIn}
                                    checked={checked}
                                    onChange={() => {
                                      setSelectedTechmobius(prev => {
                                        const next = new Set(prev);
                                        next.has(sol.id) ? next.delete(sol.id) : next.add(sol.id);
                                        return next;
                                      });
                                    }}
                                    className="mt-0.5 h-3.5 w-3.5 accent-blue-700 shrink-0"
                                  />
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-semibold text-slate-800 truncate">{sol.title}</p>
                                    <p className="text-[10px] text-slate-400">
                                      {sol.collateralCount} collateral{sol.collateralCount !== 1 ? "s" : ""}
                                      {alreadyIn && <span className="ml-1.5 text-amber-500 font-semibold">· already in hub</span>}
                                    </p>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <div className="flex-1 border-t border-blue-100" />
                <span className="text-[10px] text-slate-400 font-medium shrink-0">— or fill in manually below —</span>
                <div className="flex-1 border-t border-blue-100" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Target Subdomain Checkboxes */}
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
            </div>

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
              onClick={resetForm}
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
      )}

      {/* Solutions Catalogue Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {solutions.map((sol) => {
          const isEnabled = sol.enabled !== false;
          const isToggling = togglingId === sol.id;
          return (
          <div
            key={sol.id}
            id={`onboarded-${sol.id}`}
            className={`flex gap-4 p-4.5 bg-white rounded-2xl border transition-all relative overflow-hidden group ${
              !isEnabled ? "border-slate-200 bg-slate-50/50 opacity-80" : "border-slate-100 hover:border-slate-200 hover:shadow-2xs"
            }`}
          >
            {/* Visual preview — same SafeImage/PatternThumbnail fallback used on the
                live portal, so this list shows exactly what visitors see instead of
                a broken-image icon whenever a thumbnail URL is missing or fails. */}
            <div className="h-20 w-28 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 shrink-0 relative">
              <SafeImage
                src={sol.thumbnail}
                alt={sol.title}
                title={sol.title}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Meta values */}
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
                <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                  Path: {sol.url}
                </p>
                <div className="text-[9px] font-mono text-slate-500 mt-1.5 flex items-center gap-1 flex-wrap">
                  <span className="font-bold text-slate-400">Map:</span>
                  {sol.customerNames && sol.customerNames.length > 0 ? (
                    sol.customerNames.map((n) => (
                      <span key={n} className="bg-orange-50 text-orange-600 font-semibold px-1 py-0.5 rounded text-[8px] uppercase">{n}</span>
                    ))
                  ) : (
                    <span className="bg-orange-50 text-orange-600 font-semibold px-1 py-0.5 rounded text-[8px] uppercase">{sol.customerName || "all"}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {sol.tags && sol.tags.map((tag, tagIdx) => (
                    <span key={tagIdx} className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded-sm text-slate-500 font-medium">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Bottom-left: credential hint */}
              <div className="pt-2 text-[10px] text-slate-400 font-mono">
                Guest: {sol.usernamePrefill ? "Encrypted" : "None"}
              </div>
            </div>

            {/* Right action column: Hide + Edit top, Delete bottom */}
            <div className="flex flex-col justify-between items-end shrink-0 self-stretch">
              <div className="flex flex-col gap-1.5 items-end">
                <button
                  type="button"
                  onClick={() => handleToggleEnable(sol)}
                  disabled={isToggling}
                  className={`relative flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-semibold transition-all whitespace-nowrap overflow-hidden ${
                    !isEnabled
                      ? "bg-emerald-50 border-emerald-200 hover:bg-emerald-100 text-emerald-700 font-sans"
                      : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700 font-sans"
                  }`}
                  title={!isEnabled ? "Show on User View" : "Hide from User View"}
                >
                  {isToggling && (
                    <span className="absolute bottom-0 left-0 h-0.5 w-full overflow-hidden">
                      <span
                        className="absolute h-full bg-slate-500"
                        style={{ width: "45%", animation: "indeterminate-bar 1.2s linear infinite" }}
                      />
                    </span>
                  )}
                  {!isEnabled ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  <span>{!isEnabled ? "Show" : "Hide"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleEditClick(sol)}
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
        {solutions.length === 0 && (
          <div className="md:col-span-2 text-center p-8 bg-slate-50 rounded-2xl border border-slate-150">
            <p className="text-xs text-slate-400 font-mono">No corporate solutions onboarded as of this session.</p>
          </div>
        )}
      </div>
    </div>
  );
}
