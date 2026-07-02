/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Plus, Edit2, Check, X, Shield, Globe, Image, Tag, Key, Eye, EyeOff, FolderOpen, Link2, Download, AlertCircle, Upload } from "lucide-react";
import { Solution } from "../../../shared/types";

interface AdminSolutionsProps {
  solutions: Solution[];
  onRefresh: (action: string, solutionData: any) => Promise<void>;
  subdomains?: { id: string; name: string; displayName: string }[];
  prefilledSubdomain?: string | null;
  adminToken?: string;
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
  subdomains = [],
  prefilledSubdomain,
  adminToken = "",
}: AdminSolutionsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  React.useEffect(() => {
    if (prefilledSubdomain) {
      setCustomerNames([prefilledSubdomain]);
      setCustomerName(prefilledSubdomain);
    }
  }, [prefilledSubdomain]);

  const resetForm = () => {
    setIsEditing(false);
    setEditingId(null);
    setCustomerNames(["all"]);
    setCustomerName("all");
    setTitle("");
    setThumbnail("");
    setAppUrl("");
    setCredentialsDescription("");
    setUsernamePrefill("");
    setPasswordPrefill("");
    setTagsInput("");
    setGoogleDriveUrl("");
    setUploadedFiles([]);
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
          headers: { "X-Admin-Token": adminToken },
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
    const nextState = sol.enabled === false ? true : false;
    await onRefresh("update", { ...sol, enabled: nextState });
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

        {!isEditing && (
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
        )}
      </div>

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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Target Subdomain Checkboxes */}
            <div className="md:col-span-2 space-y-2">
              <span className="text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-wider inline-block">
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
                    className="h-3.5 w-3.5 accent-indigo-600 rounded border-slate-350"
                  />
                  <span className="text-slate-900 font-mono font-bold">All (Global Asset)</span>
                </label>
                {subdomains.map((sub) => (
                  <label key={sub.id} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={customerNames.includes(sub.name)}
                      onChange={() => handleSubdomainCheckboxChange(sub.name)}
                      className="h-3.5 w-3.5 accent-indigo-600 rounded border-slate-350"
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
                placeholder="https://dashboard.mobiusservices.co.in or http://localhost:8080"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-slate-800"
              />
            </div>

            {/* Thumbnail Upload Redesign */}
            <div className="md:col-span-2 space-y-3">
              <label className="block text-xs font-semibold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider text-[11px] font-mono">
                <Image className="h-4 w-4 text-indigo-500" /> Visual Card Thumbnail Setup
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
                              headers: { "X-Admin-Token": adminToken },
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
        {solutions.map((sol) => (
          <div
            key={sol.id}
            id={`onboarded-${sol.id}`}
            className={`flex gap-4 p-4.5 bg-white rounded-2xl border transition-all relative overflow-hidden group ${
              sol.enabled === false ? "border-slate-200 bg-slate-50/50 opacity-80" : "border-slate-100 hover:border-slate-200 hover:shadow-2xs"
            }`}
          >
            {/* Visual preview */}
            <div className="h-20 w-32 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 shrink-0">
              <img
                src={sol.thumbnail}
                alt={sol.title}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Meta values */}
            <div className="flex-1 min-w-0 flex flex-col justify-between text-left">
              <div>
                <h4 className="font-display font-semibold text-xs text-slate-900 uppercase tracking-wide truncate flex items-center gap-1.5">
                  <span className="truncate">{sol.title}</span>
                  {sol.enabled === false ? (
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
                      <span key={n} className="bg-indigo-50 text-indigo-600 font-semibold px-1 py-0.5 rounded text-[8px] uppercase">{n}</span>
                    ))
                  ) : (
                    <span className="bg-indigo-50 text-indigo-600 font-semibold px-1 py-0.5 rounded text-[8px] uppercase">{sol.customerName || "all"}</span>
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

              {/* Prefill stats preview */}
              <div className="pt-2 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                <span>Guest: {sol.usernamePrefill ? "Encrypted" : "None"}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleEnable(sol)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded border text-[10px] font-semibold transition-all ${
                      sol.enabled === false
                        ? "bg-emerald-50 border-emerald-200 hover:bg-emerald-100 text-emerald-700 font-sans"
                        : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700 font-sans"
                    }`}
                    title={sol.enabled === false ? "Show on User View" : "Hide from User View"}
                  >
                    {sol.enabled === false ? (
                      <>
                        <Eye className="h-3 w-3" />
                        <span>Show</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-3 w-3" />
                        <span>Hide</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEditClick(sol)}
                    className="p-1 border border-slate-200 rounded hover:bg-slate-50 text-slate-450 hover:text-slate-850 transition-colors"
                    title="Edit System Parameters"
                  >
                    <Edit2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
        {solutions.length === 0 && (
          <div className="md:col-span-2 text-center p-8 bg-slate-50 rounded-2xl border border-slate-150">
            <p className="text-xs text-slate-400 font-mono">No corporate solutions onboarded as of this session.</p>
          </div>
        )}
      </div>
    </div>
  );
}
