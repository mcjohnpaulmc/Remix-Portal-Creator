/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Link2, Globe, CheckCircle2, XCircle, ShieldAlert, ArrowRight } from "lucide-react";

interface MapSubdomainPanelProps {
  onReload?: () => Promise<void>;
  onClose: () => void;
}

/**
 * Shown before the mapping form every time this panel opens.
 *
 * Mapping a subdomain only changes the address the app is served from — it
 * cannot change anything the app itself does. Every item below is a failure
 * that looks like the hub broke the app but is actually the app, or a service
 * it depends on, refusing the new origin. They are listed here because each one
 * surfaces only *after* a mapping succeeds, with an error message that points
 * nowhere near the cause.
 */
const GUIDELINES: { title: string; body: string }[] = [
  {
    title: "The app must already be publicly reachable",
    body: "This creates a reverse proxy, not hosting. The app has to be live and answering on its own address first — the Test button on the next screen confirms that.",
  },
  {
    title: "A separate API must allow the new domain (CORS)",
    body: "If the app calls an API on a different domain, that API has to add your new subdomain to its allowed origins. Otherwise the page loads normally but every request fails with \"Failed to fetch\".",
  },
  {
    title: "Sign-in providers keep their own domain allowlist",
    body: "Firebase, Google, Auth0 and similar will block login from an unrecognised domain. Add the new subdomain under the provider's authorised domains — in Firebase that's Authentication → Settings → Authorized domains.",
  },
  {
    title: "Addresses compiled into the frontend will not change",
    body: "Many apps bake their API address in at build time. If that address is wrong for the new domain, only a rebuild fixes it — the ideal is a same-origin path like /api, which then works on any domain you map.",
  },
  {
    title: "The subdomain is public the moment it is mapped",
    body: "Anything the app exposes becomes reachable from the internet. To undo a mapping, delete its entry from the Solution Repository — that removes the DNS record and the proxy together.",
  },
];

// Left panel of the "Map/Onboard Solution" popup — points a brand-new subdomain
// straight at an already-public external app (reverse proxy, no upload, no
// local process), as opposed to the right panel's manual onboarding form or the
// separate Deploy Solution flow (which hosts an uploaded HTML file).
export function MapSubdomainPanel({ onReload, onClose }: MapSubdomainPanelProps) {
  const [targetUrl, setTargetUrl] = useState("");
  const [testState, setTestState] = useState<"idle" | "testing" | "public" | "not-public">("idle");
  const [testReason, setTestReason] = useState("");
  const [subdomainSlug, setSubdomainSlug] = useState("");
  const [addToRepository, setAddToRepository] = useState(true);
  const [mapping, setMapping] = useState(false);
  // Guidelines gate the form every time, rather than once per admin. The cost is
  // one click; the cost of missing them is a mapping that looks fine and fails
  // somewhere else entirely.
  const [stage, setStage] = useState<"guidelines" | "form">("guidelines");

  const handleUrlChange = (value: string) => {
    setTargetUrl(value);
    // Editing the URL invalidates any previous test — re-locks the subdomain
    // field until it's tested again.
    setTestState("idle");
    setTestReason("");
  };

  const handleTest = async () => {
    if (!targetUrl.trim()) return;
    setTestState("testing");
    setTestReason("");
    try {
      const res = await fetch("/api/admin/test-public-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestState("public");
        // Set when the app turned out to be hosted on this same server and was
        // confirmed over loopback — worth saying, since the address the admin
        // typed is not the one the proxy will actually dial.
        setTestReason(data.reason || "");
      } else {
        setTestState("not-public");
        setTestReason(data.reason || "URL is not publicly reachable.");
      }
    } catch {
      setTestState("not-public");
      setTestReason("Server error while testing the URL.");
    }
  };

  const handleMap = async () => {
    if (testState !== "public" || !subdomainSlug.trim()) return;
    setMapping(true);
    try {
      const res = await fetch("/api/admin/map-subdomain", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: targetUrl.trim(),
          subdomain: subdomainSlug.trim(),
          addToRepository,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to map the subdomain.");
        return;
      }
      await onReload?.();
      alert(`Mapped ${data.url} successfully.`);
      onClose();
    } catch {
      alert("Server error mapping the subdomain.");
    } finally {
      setMapping(false);
    }
  };

  const urlBorderClass =
    testState === "public"
      ? "border-emerald-500 ring-1 ring-emerald-200"
      : testState === "not-public"
        ? "border-red-500 ring-1 ring-red-200"
        : "border-slate-200";

  if (stage === "guidelines") {
    return (
      <div className="p-6 bg-white rounded-2xl shadow-xs space-y-5 h-full">
        <div className="pb-3 border-b border-slate-100">
          <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 text-orange-500" />
            Before you map a subdomain
          </span>
          <p className="text-xs text-slate-500 mt-1">
            Mapping changes the address an app is served from — it cannot change what the app
            does. These are the things that break afterwards, and who has to fix each one.
          </p>
        </div>

        <ol className="space-y-3">
          {GUIDELINES.map((g, i) => (
            <li key={g.title} className="flex gap-3">
              <span className="shrink-0 h-5 w-5 rounded-full bg-orange-50 border border-orange-100 text-orange-600 text-[10px] font-bold font-mono flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800 leading-snug">{g.title}</p>
                <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">{g.body}</p>
              </div>
            </li>
          ))}
        </ol>

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
            onClick={() => setStage("form")}
            className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
          >
            Continue <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-2xl shadow-xs space-y-5 h-full">
      <div className="pb-3 border-b border-slate-100 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5 text-orange-500" />
            Map Subdomain
          </span>
          <p className="text-xs text-slate-500 mt-1">
            Point a new subdomain at an app that already has a public IP — no upload, no hosting here.
          </p>
        </div>
        {/* Re-read without losing what's already typed — the form state lives
            above this branch, so returning here and continuing keeps it. */}
        <button
          type="button"
          onClick={() => setStage("guidelines")}
          className="shrink-0 text-[10px] font-semibold text-slate-400 hover:text-orange-600 hover:underline underline-offset-2 transition-colors"
        >
          Guidelines
        </button>
      </div>

      <div className="space-y-4">
        {/* Application URL + Test */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
            <Globe className="h-3 w-3" /> Enter Application URL
          </label>
          <div className="flex items-center gap-2">
            <input
              type="url"
              value={targetUrl}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="http://1.2.3.4:8080/"
              className={`flex-1 min-w-0 px-3 py-2 border rounded-lg text-xs text-slate-900 focus:outline-hidden ${urlBorderClass}`}
            />
            <button
              type="button"
              onClick={handleTest}
              disabled={!targetUrl.trim() || testState === "testing"}
              className="shrink-0 px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {testState === "testing" ? "Testing…" : "Test"}
            </button>
          </div>
          {testState === "public" && (
            <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              {testReason || "URL is publicly reachable."}
            </p>
          )}
          {testState === "not-public" && (
            <p className="text-[10px] text-red-600 mt-1 flex items-center gap-1">
              <XCircle className="h-3 w-3 shrink-0" /> {testReason}
            </p>
          )}
        </div>

        {/* Preferred subdomain — locked until the URL test passes */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Enter Preferred Subdomain</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={subdomainSlug}
              onChange={(e) => setSubdomainSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              disabled={testState !== "public"}
              placeholder="my-app"
              className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-orange-500 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
            />
            <span className="text-[10.5px] text-slate-400 font-mono whitespace-nowrap">.mobiusservices.io</span>
          </div>
          {testState !== "public" && (
            <p className="text-[10px] text-slate-400 mt-1">Test the URL above (green outline) to unlock this field.</p>
          )}
        </div>

        {/* Map to solution repository */}
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={addToRepository}
            onChange={(e) => setAddToRepository(e.target.checked)}
            className="h-3.5 w-3.5 accent-orange-600 rounded border-slate-350"
          />
          Map to solution repository
        </label>
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
          type="button"
          onClick={handleMap}
          disabled={mapping || testState !== "public" || !subdomainSlug.trim()}
          className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          {mapping ? "Mapping…" : "Map"}
        </button>
      </div>
    </div>
  );
}
