/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { X, ExternalLink, Copy, Check, Shield, User, Key, Info, Eye, EyeOff } from "lucide-react";
import { Solution } from "../../../shared/types";
import { motion, AnimatePresence } from "motion/react";

interface SolutionLaunchModalProps {
  solution: Solution | null;
  onClose: () => void;
}

export function SolutionLaunchModal({ solution, onClose }: SolutionLaunchModalProps) {
  const [copiedField, setCopiedField] = useState<"username" | "password" | null>(null);
  const [revealCredentials, setRevealCredentials] = useState(false);

  if (!solution) return null;

  const handleCopy = (text: string, field: "username" | "password") => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div id="solution-modal-container" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative bg-white rounded-2xl max-w-lg w-full border border-slate-100 shadow-2xl p-6 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-100 mb-6">
          <div>
            <span className="text-[10px] font-mono font-semibold tracking-wider text-slate-400 uppercase bg-slate-50 px-2.5 py-1 rounded-sm">
              Integrated Solution Gateway
            </span>
            <h3 id="solution-title-heading" className="font-display text-xl font-bold text-slate-900 mt-2">
              {solution.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 px-1.5 hover:bg-slate-150 text-slate-400 hover:text-slate-600 rounded-lg transition-colors border border-transparent hover:border-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="space-y-5">
          {/* Solution Snapshot */}
          <div className="aspect-video w-full rounded-xl overflow-hidden relative border border-slate-100">
            <img
              src={solution.thumbnail}
              alt={solution.title}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 via-transparent to-transparent pointer-events-none" />
          </div>

          <div className="flex items-start gap-2.5 p-3.5 bg-slate-50 border border-slate-100 rounded-xl">
            <Info className="h-4.5 w-4.5 text-slate-500 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-600 leading-relaxed">
              {solution.credentialsDescription || "Authentication elements are automatically populated code parameters. Ready to bypass manual gatekeeping dashboards."}
            </p>
          </div>

          {/* Prefilled Credentials */}
          <div className="bg-slate-950 text-slate-200 p-4.5 rounded-xl space-y-3.5 font-mono text-xs border border-slate-900 shadow-inner">
            <div className="flex items-center justify-between text-[10px] tracking-widest text-slate-500 uppercase pb-2 border-b border-slate-800">
              <span className="flex items-center gap-1.5 font-semibold text-slate-400">
                <Shield className="h-3 w-3 text-emerald-400" /> Authorized Pipeline Credentials
              </span>
              <button
                type="button"
                onClick={() => setRevealCredentials(!revealCredentials)}
                className="flex items-center gap-1 text-[9px] font-bold text-indigo-400 hover:text-indigo-300 font-sans tracking-normal uppercase bg-slate-900 px-2 py-0.5 rounded-sm border border-slate-800"
              >
                {revealCredentials ? (
                  <>
                    <EyeOff className="h-3 w-3" /> Hide Credentials
                  </>
                ) : (
                  <>
                    <Eye className="h-3 w-3" /> Show Credentials
                  </>
                )}
              </button>
            </div>

            {solution.usernamePrefill && (
              <div className="flex items-center justify-between gap-4 py-1.5 border-b border-slate-900/40">
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="text-slate-500 select-none">Username:</span>
                  <span className="text-slate-200 selection:bg-slate-700 tracking-wide font-medium">
                    {revealCredentials ? solution.usernamePrefill : "••••••••••••"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(solution.usernamePrefill || "", "username")}
                  className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-md transition-colors shrink-0 flex items-center gap-1 text-[10px] font-sans border border-transparent hover:border-slate-800"
                  title="Copy Username"
                >
                  <span className="text-[10px] text-slate-400">Copy</span>
                  {copiedField === "username" ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}

            {solution.passwordPrefill && (
              <div className="flex items-center justify-between gap-4 py-1.5">
                <div className="flex items-center gap-2">
                  <Key className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="text-slate-500 select-none">Password:</span>
                  <span className="text-slate-200 tracking-widest font-semibold selection:bg-slate-700">
                    {revealCredentials ? solution.passwordPrefill : "••••••••••••"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(solution.passwordPrefill || "", "password")}
                  className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-md transition-colors shrink-0 flex items-center gap-1 text-[10px] font-sans border border-transparent hover:border-slate-800"
                  title="Copy Password"
                >
                  <span className="text-[10px] text-slate-400">Copy</span>
                  {copiedField === "password" ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 hover:border-slate-350 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
          >
            Go Back
          </button>
          
          <a
            href={solution.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs"
          >
            Launch System
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </motion.div>
    </div>
  );
}
