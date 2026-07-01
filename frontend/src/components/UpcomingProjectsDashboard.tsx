/**
 * @license
 * SPDX-License-Identifier: Apache-2.6
 */

import React, { useState } from "react";
import { 
  FileText, ArrowLeft, Download, Info, CheckCircle, 
  Layers, Clock, HelpCircle, FileSpreadsheet, Briefcase, ChevronRight 
} from "lucide-react";
import { UpcomingProject } from "../../../shared/types";
import { motion, AnimatePresence } from "motion/react";

interface UpcomingProjectsDashboardProps {
  projects: UpcomingProject[];
  userEmail: string | null;
}

const LIFECYCLE_STAGES = [
  "Requirement gathering",
  "POC / pilot",
  "Proposal",
  "Awaiting approval"
];

export function UpcomingProjectsDashboard({ projects, userEmail }: UpcomingProjectsDashboardProps) {
  const [selectedProj, setSelectedProj] = useState<UpcomingProject | null>(null);

  const handleDocumentAction = (item: { name: string; size: string; type: string; category?: string; content?: string }) => {
    if (item.content && item.content.includes("http")) {
      const match = item.content.match(/https?:\/\/[^\s\]]+/);
      const url = match ? match[0] : item.content;
      window.open(url, "_blank");
    } else {
      alert(`Downloading corporate proposal file: "${item.name}".`);
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "Sample Data": return "bg-orange-50 text-orange-700 border-orange-200";
      case "Pricing": return "bg-rose-50 text-rose-700 border-rose-200";
      case "Proposal": return "bg-blue-50 text-blue-700 border-blue-200";
      case "Solution Approach": return "bg-emerald-50 text-emerald-700 border-emerald-200";
      default: return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "Requirement gathering": return "bg-amber-50 text-amber-700 border-amber-200";
      case "POC / pilot": return "bg-purple-50 text-purple-700 border-purple-200";
      case "Proposal": return "bg-blue-50 text-blue-700 border-blue-200";
      case "Awaiting approval": return "bg-emerald-50 text-emerald-700 border-emerald-250";
      default: return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  return (
    <div id="upcoming-opportunities-container" className="space-y-6">
      <AnimatePresence mode="wait">
        {!selectedProj ? (
          /* OPPORTUNITIES CARD MATRIX */
          <motion.div
            key="grid"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6 text-left animate-fade-in"
          >
            <div>
              <h3 className="font-display font-medium text-lg text-slate-900 leading-tight">
                Upcoming Opportunities pending proposal / approval
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Review proposed system concepts, architectural approaches, pricing packages, and pilot rollout timelines.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {projects.map((proj) => (
                <div
                  key={proj.id}
                  onClick={() => setSelectedProj(proj)}
                  className="group relative flex flex-col justify-between bg-white border border-slate-100 hover:border-indigo-200 rounded-2xl shadow-3xs hover:shadow-2xs p-5 transition-all cursor-pointer text-left overflow-hidden"
                >
                  <div>
                    {/* Status Ribbon Tag */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-400">
                        {proj.customerName}.mobiusservices.co.in
                      </span>

                      <span className={`px-2 py-0.5 text-[9px] font-mono border rounded-sm font-bold uppercase ${getStatusBadgeColor(proj.status)}`}>
                        {proj.status}
                      </span>
                    </div>

                    <h4 className="font-display font-bold text-sm text-slate-900 mt-3 group-hover:text-indigo-750 transition-colors leading-snug">
                      {proj.name}
                    </h4>
                    <span className="text-[10px] text-slate-400 font-semibold block mt-0.5 uppercase tracking-wide">
                      🏢 {proj.department}
                    </span>

                    <p className="text-xs text-slate-550 mt-2.5 line-clamp-3 leading-relaxed">
                      {proj.description}
                    </p>
                  </div>

                  <div className="mt-5 pt-3.5 border-t border-slate-50 flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span className="truncate max-w-40 font-mono">⏱️ {proj.timelines || "Timeline missing"}</span>
                    <span className="shrink-0 text-slate-350 flex items-center group-hover:text-indigo-650 font-semibold font-sans text-[10px] gap-0.5">
                      View Proposal <ChevronRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              ))}

              {projects.length === 0 && (
                <div className="col-span-full text-center py-12 bg-slate-50/50 rounded-2xl border border-slate-150 p-6">
                  <Layers className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                  <p className="text-xs text-slate-450 font-mono">No upcoming pipeline opportunities filed.</p>
                  <p className="text-[10px] text-slate-350 mt-1 max-w-sm mx-auto">
                    Toggle to the Administrative Module and choose the "Projects" tab to construct potential pilots.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          /* DEEP OPPORTUNITY PROPOSAL SUMMARY */
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6 text-left animate-fade-in font-sans"
          >
            {/* Navigation line */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <button
                onClick={() => setSelectedProj(null)}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-550 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Return to Opportunity Desk</span>
              </button>

              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400">
                PROPOSAL DISCOVERY SUMMARIZER
              </span>
            </div>

            {/* Core Header Card */}
            <div className="p-6 bg-white border border-slate-100 rounded-2xl shadow-3xs flex flex-col md:flex-row justify-between gap-6">
              <div className="space-y-1.5">
                <span className="text-[9px] font-mono font-bold uppercase tracking-widest bg-slate-100 border text-slate-400 px-3 py-1 rounded inline-block">
                  Subdomain Context: {selectedProj.customerName}
                </span>

                <h3 className="font-display font-medium text-lg text-slate-950 mt-2.5 leading-snug">
                  {selectedProj.name}
                </h3>
                <span className="text-xs text-indigo-600 font-bold block">
                  🏢 Client Department: {selectedProj.department}
                </span>
                <p className="text-xs text-slate-550 max-w-2xl leading-relaxed pt-1">
                  {selectedProj.description}
                </p>
              </div>

              {/* timelines indicator */}
              <div className="bg-amber-50 rounded-xl p-4.5 border border-amber-200/55 text-left shrink-0 max-w-xs h-fit self-start space-y-1">
                <span className="text-[10px] uppercase font-bold text-amber-700 tracking-wider flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> Projected timeling
                </span>
                <p className="text-xs font-semibold text-slate-800 leading-relaxed font-mono">
                  {selectedProj.timelines || "No target dates set"}
                </p>
              </div>
            </div>

            {/* PIPELINE ROADMAP (CHEVRONS OR DOTS) */}
            <div className="p-5 bg-white border border-slate-100 rounded-2xl shadow-3xs space-y-3">
              <h4 className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">
                Opportunity Lifecycle Milestones
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
                {LIFECYCLE_STAGES.map((stage, idx) => {
                  const isActive = selectedProj.status === stage;
                  const currentIdx = LIFECYCLE_STAGES.indexOf(selectedProj.status);
                  const isCompleted = currentIdx > idx;

                  return (
                    <div 
                      key={stage}
                      className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                        isActive 
                          ? "bg-indigo-50 border-indigo-250 ring-2 ring-indigo-50/50" 
                          : isCompleted 
                            ? "bg-slate-50 border-emerald-150" 
                            : "bg-slate-50/50 border-slate-150 opacity-60"
                      }`}
                    >
                      <div className="text-left">
                        <span className="text-[9px] font-mono font-bold text-slate-400 tracking-widest uppercase block leading-none">
                          Stage 0{idx + 1}
                        </span>
                        <span className={`text-xs font-bold leading-tight block mt-1 ${isActive ? "text-indigo-850" : isCompleted ? "text-slate-800 line-through decoration-slate-300" : "text-slate-550"}`}>
                          {stage}
                        </span>
                      </div>
                      
                      {isCompleted ? (
                        <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : isActive ? (
                        <div className="h-2 w-2 rounded-full bg-indigo-600 animate-ping mr-1" />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SCOPE, ARCHITECTURE & DOCUMENT CABINET GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Scope of proposal Card */}
              <div className="lg:col-span-6 p-5 bg-white border border-slate-100 rounded-2xl shadow-3xs space-y-3">
                <h4 className="text-xs font-mono font-bold text-slate-950 uppercase tracking-wider border-b border-slate-50 pb-2.5">
                  📐 Scope of Work (Full View)
                </h4>
                <div className="text-xs text-slate-650 leading-relaxed whitespace-pre-line p-3 border border-slate-100 bg-slate-50/20 rounded-xl text-left">
                  {selectedProj.scope || "Operational scope metrics are currently under validation."}
                </div>
              </div>

              {/* Proposed Solution Approach Card */}
              <div className="lg:col-span-6 p-5 bg-white border border-slate-100 rounded-2xl shadow-3xs space-y-3">
                <h4 className="text-xs font-mono font-bold text-slate-950 uppercase tracking-wider border-b border-slate-50 pb-2.5">
                  ⚙️ Target Solution Architecture
                </h4>
                <div className="text-xs text-slate-650 leading-relaxed whitespace-pre-line p-3 border border-slate-150 bg-slate-50/10 rounded-xl text-left font-mono">
                  {selectedProj.solution || "Technical specifications pending core architecture review."}
                </div>
              </div>

              {/* Categorized Document cabinet */}
              <div className="lg:col-span-12 p-5 bg-white border border-slate-100 rounded-2xl shadow-3xs space-y-4">
                <h4 className="text-xs font-mono font-bold text-slate-950 uppercase tracking-wider border-b border-slate-50 pb-2.5">
                  📝 Proposal Collaterals & Filed Mockups
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {selectedProj.documents?.map((item, idx) => (
                    <div 
                      key={idx} 
                      className="p-4 border border-slate-150 rounded-xl bg-slate-50/40 hover:bg-slate-50 hover:shadow-3xs transition-all text-left flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border ${getCategoryColor(item.category)}`}>
                          {item.category}
                        </span>
                        <div className="flex gap-2 items-center min-w-0 pt-1">
                          <FileText className="h-5 w-5 text-indigo-500 shrink-0" />
                          <span className="text-xs font-semibold text-slate-800 truncate leading-tight block" title={item.name}>
                            {item.name}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono block mt-0.5">Size: {item.size}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDocumentAction(item)}
                        className="mt-4 w-full py-1.8 border border-slate-205 bg-white hover:bg-slate-100 text-slate-650 text-[11px] font-semibold rounded-lg transition-colors flex items-center justify-center gap-1 shrink-0"
                      >
                        <Download className="h-3 w-3" /> Download Attachment
                      </button>
                    </div>
                  ))}

                  {(!selectedProj.documents || selectedProj.documents.length === 0) && (
                    <div className="col-span-full border border-dashed border-slate-200 py-12 rounded-xl text-center">
                      <p className="text-[11px] text-slate-400">All agreements are stored offline during requirements collection phases.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
