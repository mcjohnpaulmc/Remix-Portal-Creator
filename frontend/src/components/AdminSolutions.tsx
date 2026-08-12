/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Shield, Globe, Image, Tag, Key, FolderOpen, Link2, Upload, X, ArrowLeft } from "lucide-react";
import { Solution } from "../../../shared/types";

interface AdminSolutionsProps {
  solutions: Solution[];
  onRefresh: (action: string, solutionData: any) => Promise<void>;
  adminUserEmail?: string;
  // When provided, the form opens pre-filled to edit this solution instead of
  // creating a new one. Portal mapping isn't editable here — that's handled
  // entirely by the Map Solutions page now; this form only touches a
  // solution's own fields (title, URL, thumbnail, credentials, etc.) and
  // silently carries its existing mapping through on submit.
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
  onRefresh,
  adminUserEmail = "",
  editingSolution = null,
  onClose,
}: AdminSolutionsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  // Portal mapping isn't set here — new solutions always land in the Hub
  // Repository unmapped; editing preserves whatever the solution's existing
  // mapping already is (set via handleEditClick, never shown/edited in this form).
  const [customerNames, setCustomerNames] = useState<string[]>([]);
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
    setCustomerNames([]);
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

  const handleClose = () => {
    resetForm();
    onClose?.();
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
          {!editingId && (
            <p className="md:col-span-2 text-[10px] text-slate-400 leading-relaxed">
              Saves to the <strong className="text-slate-500 font-semibold">Solution Repository</strong> — map it to one or more portals afterward from the Map Solutions page.
            </p>
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
