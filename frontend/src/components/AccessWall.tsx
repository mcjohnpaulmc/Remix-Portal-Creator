/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { ShieldCheck, Mail, AlertTriangle, Building, ArrowRight, Eye, EyeOff, Copy, Check, ChevronDown, ChevronUp, Key } from "lucide-react";
import { motion } from "motion/react";
import { Solution } from "../../../shared/types";

interface AccessWallProps {
  onSuccess: (email: string) => void;
  solutions?: Solution[];
  targetSolutionId?: string | null;
}

export function AccessWall({ onSuccess, solutions = [], targetSolutionId = null }: AccessWallProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorString, setErrorString] = useState("");

  // Credentials Explorer state
  const [selectedSolId, setSelectedSolId] = useState<string>("");
  const [showCreds, setShowCreds] = useState(false);
  const [copiedUser, setCopiedUser] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);
  const [isCredsExpanded, setIsCredsExpanded] = useState(false);

  // Filter solutions that have prefill credentials
  const credSolutions = solutions.filter((s) => s.usernamePrefill || s.passwordPrefill);

  // Auto-select or pre-expand if a targetSolutionId is supplied
  useEffect(() => {
    if (targetSolutionId) {
      const exists = credSolutions.some((s) => s.id === targetSolutionId);
      if (exists) {
        setSelectedSolId(targetSolutionId);
        setIsCredsExpanded(true);
      }
    } else if (credSolutions.length > 0 && !selectedSolId) {
      setSelectedSolId(credSolutions[0].id);
    }
  }, [targetSolutionId, credSolutions, selectedSolId]);

  const selectedSol = credSolutions.find((s) => s.id === selectedSolId);

  const copyToClipboard = (text: string, field: "user" | "pass") => {
    if (!text) return;
    navigator.clipboard.writeText(text)
      .then(() => {
        if (field === "user") {
          setCopiedUser(true);
          setTimeout(() => setCopiedUser(false), 2000);
        } else {
          setCopiedPass(true);
          setTimeout(() => setCopiedPass(false), 2000);
        }
      })
      .catch(() => {
        // Fallback if clipboard API is restricted in standard iframe environment
        try {
          const el = document.createElement("textarea");
          el.value = text;
          document.body.appendChild(el);
          el.select();
          document.execCommand("copy");
          document.body.removeChild(el);
          if (field === "user") {
            setCopiedUser(true);
            setTimeout(() => setCopiedUser(false), 2000);
          } else {
            setCopiedPass(true);
            setTimeout(() => setCopiedPass(false), 2000);
          }
        } catch (e) {
          // Silent fallback
        }
      });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorString("");
    
    if (!email || !email.includes("@")) {
      setErrorString("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/email-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        setErrorString(data.error || "Access Denied. Something went wrong.");
      } else {
        localStorage.setItem("mobius_work_email", data.email);
        onSuccess(data.email);
      }
    } catch (err: any) {
      setErrorString("Server connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="access-wall" className="p-6 md:p-8 max-w-md w-full bg-white rounded-2xl border border-slate-100 shadow-xl mx-auto my-12 text-center">
      <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-slate-50 text-slate-700 mb-6 border border-slate-100">
        <ShieldCheck className="h-7 w-7" />
      </div>

      <h3 className="font-display text-2xl font-semibold text-slate-900 tracking-tight mb-2">
        Enterprise Gateway Only
      </h3>
      <p className="text-sm text-slate-500 mb-6 leading-relaxed">
        This resource is restricted. Access is granted exclusively to authenticated personnel with business or enterprise corporate credentials.
      </p>

      <form onSubmit={handleSubmit} className="text-left space-y-4">
        <div>
          <label htmlFor="access-email" className="block text-xs font-medium text-slate-400 uppercase tracking-widest mb-1.5">
            Work Email Address
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
            <input
              id="access-email"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-1 focus:ring-slate-800 transition-all text-slate-900"
              required
            />
          </div>
        </div>

        {errorString && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-100 text-xs leading-relaxed"
          >
            <AlertTriangle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
            <span>{errorString}</span>
          </motion.div>
        )}

        <button
          id="btn-authenticate"
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm rounded-xl transition-all disabled:opacity-50 hover:shadow-lg shadow-slate-350"
        >
          {loading ? "Verifying corporate domains..." : "Authenticate Workspace"}
          {!loading && <ArrowRight className="h-4 w-4" />}
        </button>
      </form>

      {/* Solution Credentials Explorer (Corporate Gate Pass) */}
      {credSolutions.length > 0 && (
        <div className="mt-5 pt-4 border-t border-slate-100 text-left">
          <button
            type="button"
            onClick={() => setIsCredsExpanded(!isCredsExpanded)}
            className="w-full flex items-center justify-between py-1 px-1.5 hover:bg-slate-50 rounded-lg text-xs font-semibold text-indigo-650 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-1.5 font-sans font-bold uppercase tracking-wider text-[10.5px]">
              <Key className="h-3.5 w-3.5 text-indigo-500 animate-pulse" />
              Demo / Guest Solution Credentials
            </span>
            {isCredsExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </button>

          {isCredsExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              className="mt-3.5 bg-indigo-50/40 p-4 rounded-xl border border-indigo-100/50 space-y-3 animate-fade-in"
            >
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Target Product Solution
                </label>
                <select
                  value={selectedSolId}
                  onChange={(e) => {
                    setSelectedSolId(e.target.value);
                    setShowCreds(false);
                  }}
                  className="w-full px-2.5 py-2 border border-slate-205 bg-white rounded-lg text-xs text-slate-850 font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  {credSolutions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>

              {selectedSol ? (
                <div className="space-y-3">
                  {selectedSol.credentialsDescription && (
                    <p className="text-[10px] text-slate-500 italic ml-0.5 leading-snug">
                      ℹ️ {selectedSol.credentialsDescription}
                    </p>
                  )}

                  {/* Credentials Rows */}
                  <div className="space-y-2.5 bg-white p-3 rounded-xl border border-indigo-100/30">
                    {/* Username Row */}
                    <div className="flex items-center justify-between gap-3 text-left">
                      <div className="flex-1 min-w-0">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Username / Identity</span>
                        <span className="text-slate-800 font-bold font-mono text-[11.5px] block truncate">
                          {showCreds ? (selectedSol.usernamePrefill || "Not Configured") : "•••••••••••••"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(selectedSol.usernamePrefill || "", "user")}
                        disabled={!selectedSol.usernamePrefill}
                        className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer select-none shrink-0 border ${
                          copiedUser 
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                            : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200 hover:text-slate-900"
                        }`}
                        title="Copy Username to Clipboard"
                      >
                        {copiedUser ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {copiedUser ? "Copied" : "Copy"}
                      </button>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-slate-100 border-dashed" />

                    {/* Password Row */}
                    <div className="flex items-center justify-between gap-3 text-left">
                      <div className="flex-1 min-w-0">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Activation Password</span>
                        <span className="text-slate-800 font-bold font-mono text-[11.5px] block truncate">
                          {showCreds ? (selectedSol.passwordPrefill || "Not Configured") : "•••••••••••••"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(selectedSol.passwordPrefill || "", "pass")}
                        disabled={!selectedSol.passwordPrefill}
                        className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer select-none shrink-0 border ${
                          copiedPass 
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                            : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200 hover:text-slate-900"
                        }`}
                        title="Copy Password to Clipboard"
                      >
                        {copiedPass ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {copiedPass ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>

                  {/* Toggle unmask buttons */}
                  <button
                    type="button"
                    onClick={() => setShowCreds(!showCreds)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-indigo-200 bg-white hover:bg-indigo-50 text-[10.5px] font-bold text-indigo-700 transition-all cursor-pointer shadow-3xs"
                  >
                    {showCreds ? (
                      <>
                        <EyeOff className="h-3.5 w-3.5" /> Hide Credentials
                      </>
                    ) : (
                      <>
                        <Eye className="h-3.5 w-3.5" /> Show Credentials
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <p className="text-[10px] text-slate-450 text-center">No credential configuration found.</p>
              )}
            </motion.div>
          )}
        </div>
      )}

      <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-center gap-2 text-xs text-slate-400">
        <Building className="h-3.5 w-3.5" />
        <span>Gmail, Yahoo, Outlook and other consumer addresses are blocked</span>
      </div>
    </div>
  );
}

