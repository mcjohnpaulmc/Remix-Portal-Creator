/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Plus, Edit2, X, Eye, EyeOff, Link, Tag, CheckCircle, Trash2, FolderOpen, Link2, Image, Upload } from "lucide-react";
import { Collateral } from "../../../shared/types";

interface AdminCollateralsProps {
  collaterals: Collateral[];
  onRefresh: (action: string, collateralData: any) => Promise<void>;
  subdomains?: { id: string; name: string; displayName: string }[];
  prefilledSubdomain?: string | null;
  adminUserEmail?: string;
}

const COLLATERAL_PRESETS = [
  { label: "Corporate Case Study", url: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&q=80&w=800" },
  { label: "Technical Document", url: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&q=80&w=800" },
  { label: "Strategy Presentation", url: "https://images.unsplash.com/photo-1515187029135-18ee286d815b?auto=format&fit=crop&q=80&w=800" },
  { label: "Video Demo / Media", url: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&q=80&w=800" }
];

export function AdminCollaterals({
  collaterals,
  onRefresh,
  subdomains = [],
  prefilledSubdomain,
  adminUserEmail = "",
}: AdminCollateralsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [customerNames, setCustomerNames] = useState<string[]>(["all"]);
  const [customerName, setCustomerName] = useState("all");
  const [title, setTitle] = useState("");
  const [thumbnail, setThumbnail] = useState("https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&q=80&w=800");
  const [googleDriveUrl, setGoogleDriveUrl] = useState("");
  const [tag, setTag] = useState<string>("case study");
  const [isOtherTag, setIsOtherTag] = useState(false);
  const [customTagInput, setCustomTagInput] = useState("");
  const [fileType, setFileType] = useState<string>("google slide");
  const [submitting, setSubmitting] = useState(false);
  const [uploadTab, setUploadTab] = useState<"local" | "drive">("drive");
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);

  // Auto detect file type from link URL
  const autoDetectFileTypeFromUrl = (url: string) => {
    if (!url) return;
    const lower = url.toLowerCase();
    let detected = "google doc";
    if (lower.includes("presentation") || lower.includes("slide") || lower.includes("gslides") || lower.includes(".pptx") || lower.includes(".ppt")) {
      detected = "google slide";
    } else if (lower.includes("video") || lower.includes("mp4") || lower.includes("youtube") || lower.includes("vimeo") || lower.includes(".mov")) {
      detected = "google video";
    } else if (lower.includes("spreadsheet") || lower.includes("sheet") || lower.includes(".xlsx") || lower.includes(".xls") || lower.includes(".csv") || lower.includes("gsheet")) {
      detected = "google sheet";
    } else if (lower.includes("document") || lower.includes("doc") || lower.includes("gdoc") || lower.includes(".docx") || lower.includes(".pdf")) {
      detected = "google doc";
    }
    setFileType(detected);
  };

  const handleDriveUrlChange = (val: string) => {
    setGoogleDriveUrl(val);
    autoDetectFileTypeFromUrl(val);
  };

  const handleLocalFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files) as File[];
    const uploaded: any[] = [];
    for (const f of files) {
      const formData = new FormData();
      formData.append("file", f);
      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "X-Admin-User": adminUserEmail },
          body: formData,
        });
        const data = await res.json();
        uploaded.push({ name: f.name, size: `${(f.size / (1024 * 1024)).toFixed(2)} MB`, type: f.type, url: data.url });
      } catch {
        uploaded.push({ name: f.name, size: `${(f.size / (1024 * 1024)).toFixed(2)} MB`, type: f.type });
      }
    }
    setUploadedFiles(uploaded);
    if (uploaded.length > 0) {
      if (uploaded[0].url) setGoogleDriveUrl(uploaded[0].url);

      // Auto pick type based on filename
      const filename = uploaded[0].name.toLowerCase();
      let detected = "google doc";
      if (filename.endsWith(".ppt") || filename.endsWith(".pptx") || filename.endsWith(".key") || filename.includes("slide") || filename.includes("deck") || filename.includes("presentation")) {
        detected = "google slide";
      } else if (filename.endsWith(".mp4") || filename.endsWith(".mkv") || filename.endsWith(".mov") || filename.endsWith(".avi") || filename.includes("video") || filename.includes("demo") || filename.includes("walkthrough")) {
        detected = "google video";
      } else if (filename.endsWith(".xls") || filename.endsWith(".xlsx") || filename.endsWith(".csv") || filename.includes("sheet") || filename.includes("tracker") || filename.includes("model")) {
        detected = "google sheet";
      } else if (filename.endsWith(".doc") || filename.endsWith(".docx") || filename.endsWith(".pdf") || filename.includes("doc")) {
        detected = "google doc";
      }
      setFileType(detected);

      if (!title) {
        const cleanTitle = uploaded[0].name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
        setTitle(cleanTitle);
      }
    }
  };

  React.useEffect(() => {
    if (prefilledSubdomain) {
      setCustomerNames([prefilledSubdomain]);
      setCustomerName(prefilledSubdomain);
    } else {
      setCustomerNames(["all"]);
      setCustomerName(all => all);
    }
  }, [prefilledSubdomain]);

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

  const resetForm = () => {
    setIsEditing(false);
    setEditingId(null);
    setCustomerNames(prefilledSubdomain ? [prefilledSubdomain] : ["all"]);
    setCustomerName(prefilledSubdomain || "all");
    setTitle("");
    setThumbnail("https://images.unsplash.com/photo-1454165804606-c3d57bc86b45?auto=format&fit=crop&q=80&w=800");
    setGoogleDriveUrl("");
    setTag("case study");
    setIsOtherTag(false);
    setCustomTagInput("");
    setFileType("google slide");
    setUploadTab("drive");
    setUploadedFiles([]);
  };

  const handleCommitCollateral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) {
      alert("Please provide an asset title.");
      return;
    }
    if (!googleDriveUrl) {
      alert("Please provide the Google Drive link URL.");
      return;
    }

    setSubmitting(true);
    const finalTag = isOtherTag ? (customTagInput.trim() || "other") : tag;
    const payload: any = {
      id: editingId || undefined,
      title,
      thumbnail,
      prompt: title, // maintain fallback values in database
      generatedContent: `Google Drive collateral document. [URL](${googleDriveUrl})`, // fallback
      uploadedFiles: [
        {
          name: `${title.toLowerCase().replace(/\s+/g, "_")}_link`,
          size: "Google Drive Link",
          type: "application/vnd.google-apps"
        }
      ],
      customerName: customerNames[0] || "all",
      customerNames,
      googleDriveUrl,
      tag: finalTag,
      fileType,
      enabled: editingId ? (collaterals.find((c) => c.id === editingId)?.enabled !== false) : true
    };

    try {
      await onRefresh(editingId ? "update" : "create", payload);
      resetForm();
    } catch (err) {
      alert("Error saving collateral asset.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditClick = (col: Collateral) => {
    setEditingId(col.id);
    const names = col.customerNames || (col.customerName ? [col.customerName] : ["all"]);
    setCustomerNames(names);
    setCustomerName(names[0] || "all");
    setTitle(col.title);
    setThumbnail(col.thumbnail);
    setGoogleDriveUrl(col.googleDriveUrl || "");
    
    // Check if tag is custom or pre-set
    const existingTag = col.tag || "case study";
    if (["case study", "solution doc", "sample", "demo video"].includes(existingTag)) {
      setTag(existingTag);
      setIsOtherTag(false);
      setCustomTagInput("");
    } else {
      setTag(existingTag);
      setCustomTagInput(existingTag);
      setIsOtherTag(true);
    }
    
    setFileType(col.fileType || "google slide");
    setIsEditing(true);
  };

  const handleToggleEnable = async (coll: Collateral) => {
    const nextState = coll.enabled === false ? true : false;
    await onRefresh("update", { ...coll, enabled: nextState });
  };

  const handleDeleteCollateral = async (coll: Collateral) => {
    if (confirm(`Are you sure you want to remove "${coll.title}"?`)) {
      await onRefresh("delete", { id: coll.id });
    }
  };

  return (
    <div id="admin-collaterals-view" className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-base font-bold text-slate-900 leading-tight">
            Collaterals Asset Registry
          </h3>
          <p className="text-xs text-slate-500">
            Configure Google Drive links, tagging, and formatting parameters to update client portal documents dynamically.
          </p>
        </div>

        {!isEditing && (
          <button
            onClick={() => {
              resetForm();
              setIsEditing(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add Collateral Asset
          </button>
        )}
      </div>

      {isEditing && (
        <form onSubmit={handleCommitCollateral} className="p-6 bg-white border border-slate-100 rounded-2xl shadow-3xs space-y-6 max-w-3xl text-left">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h4 className="text-xs font-mono font-bold text-orange-600 uppercase tracking-wider">
              {editingId ? "📝 Edit Collateral Asset" : "✨ Register New Collateral Asset"}
            </h4>
            <button
              type="button"
              onClick={resetForm}
              className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Title */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Asset Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="E.g., PepsiCo Logistics Optimization Deck"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-800 focus:border-slate-800 bg-white"
                required
              />
            </div>

            {/* Dual Upload Strategy Section (Local Folders + Google Drive Link) */}
            <div className="md:col-span-2 space-y-3">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                📁 Asset Attachment Mode
              </label>
              
              <div className="flex gap-2">
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
              <div className="bg-slate-50/70 p-4 rounded-xl border border-dashed border-slate-205 text-left">
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
                      <span className="text-[10px] text-slate-450 mt-0.5">PDF, DOCX, XLSX, PPTX, MP4</span>
                    </div>

                    {uploadedFiles.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[10px] uppercase font-mono font-bold text-slate-400">Successfully Selected ({uploadedFiles.length})</span>
                        <div className="max-h-24 overflow-y-auto space-y-1">
                          {uploadedFiles.map((f, fIdx) => (
                            <div key={fIdx} className="flex justify-between items-center bg-white p-1.5 rounded px-2.5 text-[10px] font-mono border border-slate-150">
                              <span className="text-orange-600 truncate max-w-[200px]">📎 {f.name}</span>
                              <span className="text-slate-400 shrink-0">{f.size}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Input document, slide, video, sheet link</label>
                    <input
                      type="url"
                      value={googleDriveUrl}
                      onChange={(e) => handleDriveUrlChange(e.target.value)}
                      placeholder="https://drive.google.com/your-document-link"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-800 focus:border-slate-800 bg-white"
                      required={uploadTab === "drive"}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Thumbnail Upload Redesign */}
            <div className="md:col-span-2 space-y-3">
              <label className="block text-xs font-semibold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider text-[11px] font-mono">
                <Image className="h-4 w-4 text-orange-500" /> Cover Photo Setup (Local Image Upload)
              </label>
              
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* Visual Preview area */}
                <div className="md:col-span-4 flex flex-col justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl min-h-[140px] items-center text-center">
                  <span className="text-[10px] uppercase font-mono font-bold text-slate-400 block mb-2 tracking-wider">Live Cover Preview</span>
                  {thumbnail ? (
                    <div className="relative group w-full max-w-[150px] aspect-video rounded-lg overflow-hidden border border-slate-200 shadow-xs">
                      <img 
                        src={thumbnail} 
                        alt="Cover live preview" 
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
                      <span className="text-[10px] font-medium">No cover image uploaded</span>
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
                    onClick={() => document.getElementById("collateral-thumbnail-input")?.click()}
                    className="border-2 border-dashed border-slate-200 hover:border-slate-400 bg-white hover:bg-slate-50/50 rounded-xl p-5 text-center cursor-pointer transition-all duration-150 group"
                  >
                    <input
                      type="file"
                      id="collateral-thumbnail-input"
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
                    <p className="text-xs text-slate-700 font-bold font-sans">Upload cover from local computer</p>
                    <p className="text-[10px] text-slate-400 mt-1">Accepts PNG, JPG, JPEG, WEBP or GIF (Converts to high-fidelity dashboard visual)</p>
                  </div>

                  {/* Preset and URL options */}
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/20 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                      <span>Or, select professional cover presets:</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {COLLATERAL_PRESETS.map((preset, pIdx) => (
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

            {/* Tag / Category Category */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Tag className="h-3.5 w-3.5 text-orange-500" />
                Asset Category Tag
              </label>
              <select
                value={isOtherTag ? "other" : tag}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "other") {
                    setIsOtherTag(true);
                  } else {
                    setIsOtherTag(false);
                    setTag(val);
                  }
                }}
                className="w-full px-3 py-2 border border-slate-200 bg-white rounded-lg text-xs text-slate-900 focus:outline-none"
              >
                <option value="case study">Case Study</option>
                <option value="solution doc">Solution Doc</option>
                <option value="sample">Sample</option>
                <option value="demo video">Demo Video</option>
                <option value="other">Other (Type Custom...)</option>
              </select>

              {isOtherTag && (
                <div className="mt-2 animate-fade-in">
                  <input
                    type="text"
                    value={customTagInput}
                    onChange={(e) => {
                      setCustomTagInput(e.target.value);
                      setTag(e.target.value);
                    }}
                    placeholder="Enter custom asset tag / category"
                    className="w-full px-3 py-2 border border-slate-200 bg-white rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-800"
                    required
                  />
                </div>
              )}
            </div>

            {/* Linked Subdomain Visibility Checkboxes */}
            <div className="md:col-span-2 space-y-1.5 animate-fade-in">
              <label className="block text-xs font-semibold text-slate-700">
                Linked Customer Subdomain Portals (Visibility Contexts)
              </label>
              <div className="p-3 bg-slate-50 border border-slate-205 rounded-xl grid grid-cols-2 sm:grid-cols-3 gap-2.5">
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
                    <span className="text-slate-700 font-mono text-[11px]">{sub.displayName}</span>
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-slate-400">
                Select whether this asset is global or targeted inside specific customer subdomains.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-700 text-xs font-bold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              {submitting ? "Committing..." : editingId ? "Update Asset" : "Publish Asset"}
            </button>
          </div>
        </form>
      )}

      {/* Asset Grid in Admin Console */}
      {!isEditing && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {collaterals.map((coll) => {
            const mappedFileType = coll.fileType || "google doc";
            const mappedTag = coll.tag || "case study";
            const dLink = coll.googleDriveUrl || "#";

            return (
              <div
                key={coll.id}
                className={`p-4 rounded-2xl border transition-all flex gap-4 ${
                  coll.enabled === false ? "border-slate-200 bg-slate-50/50 opacity-80" : "border-slate-100 hover:border-slate-200 hover:shadow-2xs bg-white"
                }`}
              >
                <div className="h-20 w-32 rounded-xl bg-slate-100 border border-slate-150 overflow-hidden shrink-0">
                  <img
                    src={coll.thumbnail}
                    alt={coll.title}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-between text-left">
                  <div>
                    <h4 className="font-display font-bold text-xs text-slate-900 uppercase tracking-wide truncate flex items-center gap-1.5">
                      <span className="truncate">{coll.title}</span>
                      {coll.enabled === false ? (
                        <span className="shrink-0 text-[8px] bg-amber-50 text-amber-600 border border-amber-200 px-1 py-0.5 rounded-sm uppercase tracking-wide font-semibold">
                          Hidden
                        </span>
                      ) : (
                        <span className="shrink-0 text-[8px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-1 py-0.5 rounded-sm uppercase tracking-wide font-semibold">
                          Visible
                        </span>
                      )}
                    </h4>
                    
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <span className="text-[9px] bg-orange-50 border border-orange-150 text-orange-700 px-2 py-0.5 rounded-sm font-semibold capitalize">
                        📁 {mappedFileType}
                      </span>
                      <span className="text-[9px] bg-amber-50 border border-amber-150 text-amber-700 px-2 py-0.5 rounded-sm font-semibold capitalize">
                        🏷️ {mappedTag}
                      </span>
                    </div>

                    <p className="text-[10px] text-slate-400 mt-2 truncate font-mono">
                      Target Link: {dLink}
                    </p>
                  </div>

                  <div className="pt-2 flex items-center justify-between text-[10px] text-slate-400 font-mono border-t border-slate-50 mt-2">
                    <div className="flex gap-1 items-center flex-wrap">
                      <span className="font-semibold text-slate-400">Map:</span>
                      {coll.customerNames && coll.customerNames.length > 0 ? (
                        coll.customerNames.map((n) => (
                          <span key={n} className="bg-orange-50 border border-orange-150 text-orange-750 font-bold px-1 py-0.5 rounded text-[8px] uppercase">{n}</span>
                        ))
                      ) : (
                        <span className="bg-orange-50 border border-orange-150 text-orange-755 font-bold px-1 py-0.5 rounded text-[8px] uppercase">{coll.customerName || "all"}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleEnable(coll)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded border text-[10px] font-semibold transition-all cursor-pointer ${
                          coll.enabled === false
                            ? "bg-emerald-50 border-emerald-200 hover:bg-emerald-100 text-emerald-700"
                            : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700"
                        }`}
                      >
                        {coll.enabled === false ? "Show" : "Hide"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEditClick(coll)}
                        className="p-1 border border-slate-200 rounded hover:bg-slate-50 text-slate-450 hover:text-slate-850 cursor-pointer"
                        title="Edit Collateral Link"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCollateral(coll)}
                        className="p-1 border border-slate-200 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 cursor-pointer"
                        title="Delete Collateral Link"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {collaterals.length === 0 && (
            <div className="md:col-span-2 text-center p-8 bg-slate-50 rounded-2xl border border-slate-150">
              <p className="text-xs text-slate-400 font-mono">No registered assets configured yet.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
