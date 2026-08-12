/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { X, Globe, Image, Upload, Lock } from "lucide-react";
import { Solution } from "../../../shared/types";

interface EditSolutionQuickPopupProps {
  solution: Solution;
  onRefresh: (action: string, solutionData: any) => Promise<void>;
  adminUserEmail?: string;
  onClose: () => void;
}

// Same presets offered on the full onboarding form — kept here as a small,
// intentional duplicate rather than a shared import, since this quick-edit
// popup and the onboarding form otherwise have nothing else in common.
const VISUAL_PRESETS = [
  { label: "Dashboard", url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=800" },
  { label: "Sourcing", url: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=800" },
  { label: "Retail Tech", url: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=800" },
  { label: "Server Room", url: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&q=80&w=800" }
];

// A lighter-weight edit popup for the Solution Repository list — only the
// title, URL, and thumbnail (not the full onboarding form's tags/credentials/
// supporting-file fields, and never portal mapping, which belongs to Map
// Solutions). The URL is locked for solutions deployed via Deploy Solution:
// its value is derived from the app's own dedicated subdomain, not free text.
export function EditSolutionQuickPopup({
  solution,
  onRefresh,
  adminUserEmail = "",
  onClose,
}: EditSolutionQuickPopupProps) {
  const isDeployed = !!solution.deployedSlug;
  const [title, setTitle] = useState(solution.title);
  const [appUrl, setAppUrl] = useState(solution.url);
  const [thumbnail, setThumbnail] = useState(solution.thumbnail);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert("Please enter a Solution Title.");
      return;
    }
    setSubmitting(true);
    try {
      await onRefresh("update", { id: solution.id, title: title.trim(), url: appUrl, thumbnail });
      onClose();
    } catch {
      alert("Execution error while trying to save changes.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 bg-white rounded-2xl shadow-xs space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">Edit Solution</span>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4">
        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Solution Name / Title</label>
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
            <Globe className="h-3 w-3" /> Application URL
          </label>
          {isDeployed ? (
            <>
              <input
                type="url"
                value={appUrl}
                disabled
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-400 bg-slate-50 cursor-not-allowed"
              />
              <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                <Lock className="h-3 w-3 shrink-0" /> Deployed to its own subdomain — the URL is managed automatically and can't be edited here.
              </p>
            </>
          ) : (
            <input
              type="url"
              value={appUrl}
              onChange={(e) => setAppUrl(e.target.value)}
              placeholder="https://dashboard.mobiusservices.io or http://localhost:8080"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-slate-800"
            />
          )}
        </div>

        {/* Thumbnail */}
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider text-[11px] font-mono">
            <Image className="h-4 w-4 text-orange-500" /> Visual Card Thumbnail Setup
            <span className="text-slate-400 normal-case font-sans font-normal tracking-normal">(optional)</span>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-4 flex flex-col justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl min-h-[140px] items-center text-center">
              <span className="text-[10px] uppercase font-mono font-bold text-slate-400 block mb-2 tracking-wider">Live Thumbnail Preview</span>
              {thumbnail ? (
                <div className="relative group w-full max-w-[150px] aspect-video rounded-lg overflow-hidden border border-slate-200 shadow-xs">
                  <img src={thumbnail} alt="Thumbnail live preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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
            </div>

            <div className="md:col-span-8 flex flex-col justify-center space-y-3">
              <div
                onClick={() => document.getElementById("edit-solution-thumbnail-input")?.click()}
                className="border-2 border-dashed border-slate-200 hover:border-slate-400 bg-white hover:bg-slate-50/50 rounded-xl p-5 text-center cursor-pointer transition-all duration-150 group"
              >
                <input
                  type="file"
                  id="edit-solution-thumbnail-input"
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
                <p className="text-[10px] text-slate-400 mt-1">Accepts PNG, JPG, JPEG, WEBP or GIF</p>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/20 flex flex-col gap-2">
                <div className="text-[11px] font-semibold text-slate-600">Or, select premium presets:</div>
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
      </div>

      <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3.5">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 border border-slate-200 hover:border-slate-350 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          {submitting ? "Saving changes..." : "Apply Modifications"}
        </button>
      </div>
    </form>
  );
}
