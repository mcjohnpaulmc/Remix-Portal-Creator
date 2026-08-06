/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { X, Rocket, FileCode } from "lucide-react";

interface DeploySolutionFormProps {
  subdomains?: { id: string; name: string; displayName: string }[];
  prefilledSubdomain?: string | null;
  onReload?: () => Promise<void>;
  onClose?: () => void;
}

export function DeploySolutionForm({
  subdomains = [],
  prefilledSubdomain,
  onReload,
  onClose,
}: DeploySolutionFormProps) {
  const [deployFile, setDeployFile] = useState<File | null>(null);
  const [deployTitle, setDeployTitle] = useState("");
  const [deploySlug, setDeploySlug] = useState("");
  const [deployCustomerNames, setDeployCustomerNames] = useState<string[]>(prefilledSubdomain ? [prefilledSubdomain] : ["all"]);
  const [deploySubmitting, setDeploySubmitting] = useState(false);
  const [deployError, setDeployError] = useState("");

  const handleClose = () => {
    setDeployFile(null);
    setDeployTitle("");
    setDeploySlug("");
    setDeployCustomerNames(prefilledSubdomain ? [prefilledSubdomain] : ["all"]);
    setDeployError("");
    onClose?.();
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
  // (DNS record + static IIS site — auto-derived from the title when no
  // subdomain is entered), and creates a Solution card pointing at that
  // subdomain — clicking the card on a mapped portal opens the deployed app.
  const handleDeploySolution = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeployError("");
    if (!deployFile || !deployTitle.trim()) {
      setDeployError("HTML file and title are required.");
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
      handleClose();
    } catch {
      setDeployError("Network error. Try again.");
    } finally {
      setDeploySubmitting(false);
    }
  };

  return (
    <form onSubmit={handleDeploySolution} className="p-6 bg-white rounded-2xl shadow-xs space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
          <Rocket className="h-3.5 w-3.5 text-orange-500" />
          Deploy Standalone HTML App
        </span>
        <button type="button" onClick={handleClose} className="text-slate-400 hover:text-slate-600 transition-colors">
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
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Subdomain Name <span className="text-slate-400 font-normal">(optional — auto-generated from the title if left blank)</span>
          </label>
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
          onClick={handleClose}
          className="px-4 py-2 border border-slate-250 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
