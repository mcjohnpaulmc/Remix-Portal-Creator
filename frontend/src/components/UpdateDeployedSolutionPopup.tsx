/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Upload, X, Rocket, Globe, AlertTriangle } from "lucide-react";
import { Solution } from "../../../shared/types";

interface UpdateDeployedSolutionPopupProps {
  solution: Solution;
  onClose: () => void;
  onReload?: () => Promise<void>;
  onNotify?: (message: string) => void;
}

/**
 * Replaces the HTML served by an already-deployed standalone app, optionally
 * moving it to a different subdomain in the same step.
 *
 * Only offered for solutions this hub hosts a file for. A "Map Subdomain" entry
 * carries the same deployedSlug/deployedDomain fields but proxies an external
 * origin, so there is nothing here to replace — see isUpdatableHtmlApp below,
 * which is the single rule deciding where the Update button appears.
 */
export function UpdateDeployedSolutionPopup({
  solution,
  onClose,
  onReload,
  onNotify,
}: UpdateDeployedSolutionPopupProps) {
  const domain = solution.deployedDomain || "mobiusservices.io";
  const currentSlug = solution.deployedSlug || "";

  const [file, setFile] = useState<File | null>(null);
  const [changeSubdomain, setChangeSubdomain] = useState(false);
  const [slug, setSlug] = useState(currentSlug);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const slugChanged = changeSubdomain && slug.trim() !== "" && slug.trim() !== currentSlug;

  const handleSubmit = async () => {
    if (!file) {
      setError("Choose the new HTML file to deploy.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("solutionId", solution.id);
      // Sent only when the admin actually opted to move it; the backend treats an
      // empty value as "keep the current subdomain".
      if (slugChanged) body.append("subdomain", slug.trim());

      // No Content-Type header — the browser must set the multipart boundary.
      const res = await fetch("/api/admin/update-deployed-solution", {
        method: "POST",
        credentials: "include",
        body,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to update the app.");
        return;
      }
      await onReload?.();
      onNotify?.(
        data.slugChanged
          ? `Updated and moved to ${data.url}.`
          : `Updated ${data.url}.`
      );
      onClose();
    } catch {
      setError("Server error updating the app.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 bg-white rounded-2xl shadow-xs space-y-5">
      <div className="pb-3 border-b border-slate-100 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <Rocket className="h-3.5 w-3.5 text-orange-500" />
            Update Deployed App
          </span>
          <p className="text-xs text-slate-500 mt-1 truncate">
            {solution.title} — currently at{" "}
            <span className="font-mono text-slate-600">{currentSlug}.{domain}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-slate-400 hover:text-slate-600 transition-colors"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* New version */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-slate-500">
          New version <span className="text-slate-400 font-normal">(.html or .htm)</span>
        </label>
        <div
          onClick={() => document.getElementById("update-html-input")?.click()}
          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
            file
              ? "border-emerald-400 bg-emerald-50/40"
              : "border-slate-200 hover:border-slate-400 bg-white hover:bg-slate-50/50"
          }`}
        >
          <input
            type="file"
            id="update-html-input"
            accept=".html,.htm"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setError("");
            }}
            className="hidden"
          />
          <Upload className={`h-5 w-5 mx-auto mb-1.5 ${file ? "text-emerald-600" : "text-slate-400"}`} />
          {file ? (
            <>
              <p className="text-xs font-bold text-slate-800 truncate">{file.name}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{(file.size / 1024).toFixed(0)} KB — click to choose a different file</p>
            </>
          ) : (
            <>
              <p className="text-xs font-bold text-slate-700">Click to choose the new HTML file</p>
              <p className="text-[10px] text-slate-400 mt-0.5">This replaces the version currently being served</p>
            </>
          )}
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed flex items-start gap-1">
          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-amber-500" />
          The existing file is overwritten and cannot be recovered from the hub. Visitors may need a
          hard refresh to stop seeing the cached old version.
        </p>
      </div>

      {/* Optional subdomain change */}
      <div className="space-y-2 pt-3 border-t border-slate-100">
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={changeSubdomain}
            onChange={(e) => {
              setChangeSubdomain(e.target.checked);
              if (!e.target.checked) setSlug(currentSlug);
            }}
            className="h-3.5 w-3.5 accent-orange-600 rounded border-slate-350"
          />
          <Globe className="h-3 w-3 text-slate-400" />
          Also move it to a different subdomain
          <span className="text-slate-400 font-normal">(optional)</span>
        </label>

        {changeSubdomain && (
          <div className="space-y-1.5 pl-6">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="my-app"
                className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
              />
              <span className="text-[10.5px] text-slate-400 font-mono whitespace-nowrap">.{domain}</span>
            </div>
            {slugChanged ? (
              <p className="text-[10px] text-amber-600 leading-relaxed">
                The old address <span className="font-mono">{currentSlug}.{domain}</span> stops working —
                its DNS record and site are removed. Update any links or bookmarks pointing at it.
              </p>
            ) : (
              <p className="text-[10px] text-slate-400">Leave unchanged to keep the current address.</p>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3.5">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 border border-slate-200 hover:border-slate-350 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !file}
          className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          {submitting ? "Updating…" : slugChanged ? "Update & Move" : "Update App"}
        </button>
      </div>
    </div>
  );
}

/**
 * Whether the Update button should be offered for a solution: the hub must be
 * serving a file for it, which rules out "Map Subdomain" proxies that share the
 * same deployedSlug/deployedDomain fields but host nothing.
 */
export function isUpdatableHtmlApp(solution: Solution): boolean {
  return !!solution.deployedSlug && !solution.mappedExternalUrl;
}
