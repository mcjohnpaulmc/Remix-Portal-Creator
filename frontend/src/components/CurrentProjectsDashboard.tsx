/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState } from "react";
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  AreaChart, Area, LineChart, Line, CartesianGrid 
} from "recharts";
import { 
  Award, Clock, Sparkles, FileText, ArrowLeft, MessageSquare, 
  TrendingUp, Download, Info, CheckCircle, ShieldAlert 
} from "lucide-react";
import { CurrentProject } from "../../../shared/types";
import { motion, AnimatePresence } from "motion/react";

interface CurrentProjectsDashboardProps {
  projects: CurrentProject[];
  userEmail: string | null;
}

export function CurrentProjectsDashboard({ projects, userEmail }: CurrentProjectsDashboardProps) {
  const [selectedProj, setSelectedProj] = useState<CurrentProject | null>(null);

  // Dynamic file download or Google Drive link opening
  const handleDocumentAction = (item: { name: string; size: string; type: string; content?: string }) => {
    if (item.content && item.content.includes("http")) {
      const match = item.content.match(/https?:\/\/[^\s\]]+/);
      const url = match ? match[0] : item.content;
      window.open(url, "_blank");
    } else {
      alert(`Initiating secure, authenticated download for corporate asset: "${item.name}".`);
    }
  };

  const getFileIconColor = (name: string) => {
    if (name.endsWith(".pdf")) return "text-red-500 bg-red-50 border-red-200";
    if (name.endsWith(".docx") || name.endsWith(".doc")) return "text-blue-500 bg-blue-50 border-blue-200";
    if (name.endsWith(".xlsx")) return "text-emerald-500 bg-emerald-50 border-emerald-200";
    return "text-slate-500 bg-slate-50 border-slate-205";
  };

  // Prepare Chart Data Helper
  const buildTrendData = (proj: CurrentProject) => {
    const data: any[] = [];
    const len = proj.deliveryLabels?.length || 6;
    for (let i = 0; i < len; i++) {
      data.push({
        month: proj.deliveryLabels?.[i] || `Month ${i + 1}`,
        volume: proj.deliveryValues?.[i] || 0,
        quality: proj.qualityValues?.[i] || 0,
        tat: proj.tatValues?.[i] || 0
      });
    }
    return data;
  };

  return (
    <div id="current-projects-container" className="space-y-6">
      <AnimatePresence mode="wait">
        {!selectedProj ? (
          /* PROJECT GRID VIEW */
          <motion.div
            key="grid"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6 text-left animate-fade-in"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-display font-medium text-lg text-slate-900 leading-tight">
                  Customer Operations Dashboard
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time engineering delivery logs, automated SLA validation, and system turnaround metrics.
                </p>
              </div>

              <div className="flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-mono px-3 py-1.5 rounded-lg border border-emerald-250 font-bold self-start">
                <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse mr-1" />
                <span>ACTIVE SERVICE SYNC COMPLIANT</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {projects.map((proj) => {
                const recentQuality = proj.qualityValues?.[proj.qualityValues.length - 1] || 100;
                return (
                  <div
                    key={proj.id}
                    onClick={() => setSelectedProj(proj)}
                    className="group relative flex flex-col justify-between bg-white border border-slate-100 hover:border-orange-200/80 rounded-2xl shadow-3xs hover:shadow-2xs p-5 transition-all text-left cursor-pointer"
                  >
                    <div>
                      {/* Subdomain Category Label */}
                      <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-[8px] px-2.5 py-0.8 bg-slate-50 border border-slate-200 text-slate-400 rounded-sm inline-block">
                        Tenant: {proj.customerName}.mobiusservices.co.in
                      </span>

                      <h4 className="font-display font-bold text-sm text-slate-900 mt-3 group-hover:text-orange-750 transition-colors leading-snug">
                        {proj.name}
                      </h4>
                      <p className="text-slate-400 text-[10px] uppercase tracking-widest font-mono font-semibold mt-1">
                        🏢 {proj.department}
                      </p>

                      <p className="text-xs text-slate-500 mt-2.5 line-clamp-2 leading-relaxed">
                        {proj.description}
                      </p>
                    </div>

                    <div className="mt-5 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-[11px] font-mono font-medium text-slate-450">
                      <div>
                        <span className="block text-[9px] font-sans text-slate-400 uppercase font-semibold">Latest SLA</span>
                        <span className="text-slate-900 font-bold text-xs">{recentQuality}%</span>
                      </div>
                      <div>
                        <span className="block text-[9px] font-sans text-slate-400 uppercase font-semibold">Turnaround (TAT)</span>
                        <span className="text-slate-900 font-bold text-xs">{proj.tatActual || "N/A"}</span>
                      </div>
                    </div>

                    <div className="absolute top-4 right-4 h-6 w-6 bg-slate-50 rounded-full flex items-center justify-center group-hover:bg-orange-50 border border-slate-100 group-hover:border-orange-150 transition-colors">
                      <TrendingUp className="h-3 w-3 text-slate-350 group-hover:text-orange-650" />
                    </div>
                  </div>
                );
              })}

              {projects.length === 0 && (
                <div className="col-span-full text-center py-12 bg-slate-50/50 rounded-2xl border border-slate-150 p-6">
                  <Info className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                  <p className="text-xs text-slate-450 font-mono">No active engagements mapped to this database catalog.</p>
                  <p className="text-[10px] text-slate-350 mt-1 max-w-sm mx-auto">
                    Administrators must transition upcoming proposals or provision current project records inside the Admin Module.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          /* DETAILED METRICS VIEW */
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6 text-left animate-fade-in"
          >
            {/* Upper breadcrumb header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <button
                onClick={() => setSelectedProj(null)}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-550 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Return to Overview</span>
              </button>

              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400">
                ACTIVE PIPELINE METRICS PORTAL
              </span>
            </div>

            {/* Core Project Card Details Title */}
            <div className="p-6 bg-white border border-slate-100 rounded-2xl shadow-3xs flex flex-col md:flex-row justify-between gap-6">
              <div className="space-y-2">
                <span className="text-[9px] font-mono font-bold uppercase tracking-widest bg-slate-100 border text-slate-500 px-3 py-1 rounded">
                  {selectedProj.customerName}.mobiusservices.co.in
                </span>
                <h3 className="font-display font-medium text-lg text-slate-950 mt-2 leading-snug">
                  {selectedProj.name}
                </h3>
                <p className="text-xs text-slate-450 font-medium tracking-wide uppercase">
                  🏢 {selectedProj.department}
                </p>
                <p className="text-xs text-slate-600 leading-relaxed max-w-2xl pt-1">
                  {selectedProj.description}
                </p>
              </div>

              {/* Status parameters column */}
              <div className="grid grid-cols-2 gap-4 h-fit bg-slate-50 border border-slate-150 p-4 rounded-xl shrink-0">
                <div className="text-left">
                  <span className="block text-[10px] uppercase text-slate-400 font-semibold font-sans">Actual average TAT</span>
                  <span className="text-slate-900 font-bold font-mono text-base">{selectedProj.tatActual || "18.5 hrs"}</span>
                </div>
                <div className="text-left border-l border-slate-200 pl-4">
                  <span className="block text-[10px] uppercase text-slate-400 font-semibold font-sans font-sans">Target TAT SLA</span>
                  <span className="text-orange-650 font-bold font-mono text-base">{selectedProj.tatTarget || "24.0 hrs"}</span>
                </div>
              </div>
            </div>

            {/* CHARTS CONTAINER (GRID 12) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Delivery Volumes Column */}
              {!(selectedProj.hiddenSections?.includes("deliveryVolumeChart")) && (
                <div className="lg:col-span-6 p-5 bg-white border border-slate-100 rounded-2xl shadow-3xs space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between border-b border-slate-50 pb-2.5">
                    <h4 className="text-xs font-mono font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <TrendingUp className="h-4 w-4 text-orange-500" /> Delivery Volumes & Trends
                    </h4>
                    <span className="text-[10px] font-sans text-slate-400">Month-over-Month volume trends</span>
                  </div>

                  <div className="h-64 pt-2 font-mono text-[11px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={buildTrendData(selectedProj)} margin={{ left:-10, right:10, top: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="month" stroke="#94a3b8" fontSize={10} />
                        <YAxis stroke="#94a3b8" fontSize={10} />
                        <Tooltip 
                          contentStyle={{ fontSize: 11, background: "#0f172a", borderRadius: 8, color: "#fff", border: "none" }}
                          labelStyle={{ fontWeight: "bold" }}
                        />
                        <Bar dataKey="volume" name="Fulfillment Units" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Quality Trends Column */}
              {!(selectedProj.hiddenSections?.includes("qualitySLAChart")) && (
                <div className="lg:col-span-6 p-5 bg-white border border-slate-100 rounded-2xl shadow-3xs space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between border-b border-slate-50 pb-2.5">
                    <h4 className="text-xs font-mono font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Award className="h-4.5 w-4.5 text-emerald-500" /> Quality & SLA Fulfillment (%)
                    </h4>
                    <span className="text-[10px] font-sans text-slate-400">Target Benchmark: 98.0%</span>
                  </div>

                  <div className="h-64 pt-2 font-mono text-[11px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={buildTrendData(selectedProj)} margin={{ left:-20, right:10, top: 10, bottom: 5 }}>
                        <defs>
                          <linearGradient id="qualityColor" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="month" stroke="#94a3b8" fontSize={10} />
                        <YAxis stroke="#94a3b8" domain={[95, 100]} fontSize={10} />
                        <Tooltip 
                          contentStyle={{ fontSize: 11, background: "#0f172a", borderRadius: 8, color: "#fff", border: "none" }}
                          labelStyle={{ fontWeight: "bold" }}
                        />
                        <Area type="monotone" name="SLA Correctness" dataKey="quality" stroke="#10b981" fillOpacity={1} fill="url(#qualityColor)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* TAT Trajectory Line chart */}
              {!(selectedProj.hiddenSections?.includes("tatChart")) && (
                <div className="lg:col-span-6 p-5 bg-white border border-slate-100 rounded-2xl shadow-3xs space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between border-b border-slate-50 pb-2.5">
                    <h4 className="text-xs font-mono font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-sky-500" /> Turnaround (TAT) reduction report
                    </h4>
                    <span className="text-[10px] text-slate-400">Average completion (hours)</span>
                  </div>

                  <div className="h-64 pt-2 font-mono text-[11px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={buildTrendData(selectedProj)} margin={{ left:-15, right:10, top: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="month" stroke="#94a3b8" fontSize={10} />
                        <YAxis stroke="#94a3b8" fontSize={10} />
                        <Tooltip 
                          contentStyle={{ fontSize: 11, background: "#0f172a", borderRadius: 8, color: "#fff", border: "none" }}
                        />
                        <Line type="monotone" name="Completed TAT Average" dataKey="tat" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Downloadable Source Materials Cabinet */}
              {!(selectedProj.hiddenSections?.includes("governanceDocs")) && (
                <div className="lg:col-span-6 p-5 bg-white border border-slate-100 rounded-2xl shadow-3xs space-y-3 animate-fade-in">
                  <h4 className="text-xs font-mono font-bold text-slate-900 uppercase tracking-wider border-b border-slate-50 pb-2.5 flex items-center gap-1.5">
                    <FileText className="h-4.5 w-4.5 text-slate-450" /> Governance Agreement & Telemetry Logs
                  </h4>

                  <div className="space-y-2 max-h-64 overflow-y-auto custom-scroll">
                    {selectedProj.documents?.map((item, idx) => (
                      <div 
                        key={idx}
                        className="flex items-center justify-between p-2.5 border border-slate-100 bg-slate-50/50 hover:bg-slate-50 rounded-xl text-left"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`h-8 w-8 rounded-lg border flex items-center justify-center shrink-0 ${getFileIconColor(item.name)}`}>
                            <FileText className="h-4 w-4" />
                          </div>
                          <div className="truncate">
                            <span className="text-xs font-semibold text-slate-800 block truncate leading-tight">{item.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">Size: {item.size}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDocumentAction(item)}
                          className="p-2 border border-slate-205 hover:bg-white rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
                          title="Download Asset"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}

                    {(!selectedProj.documents || selectedProj.documents.length === 0) && (
                      <div className="py-12 border border-dashed border-slate-180 rounded-xl text-center">
                        <p className="text-[11px] text-slate-400">No telemetry source agreements published for this view.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Innovations list (Grid 12 - bottom split left) */}
              {!(selectedProj.hiddenSections?.includes("innovations")) && (
                <div className="lg:col-span-6 p-5 bg-white border border-slate-100 rounded-2xl shadow-3xs space-y-3 animate-fade-in">
                  <h4 className="text-xs font-mono font-bold text-slate-900 uppercase tracking-wider border-b border-slate-50 pb-2.5 flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-yellow-500" /> Innovations, Enhancements & Business Impact Created
                  </h4>

                  <div className="space-y-3 max-h-72 overflow-y-auto custom-scroll">
                    {selectedProj.innovations?.map((item, idx) => (
                      <div key={idx} className="p-3.5 border border-slate-100 rounded-xl bg-slate-50/40 text-left relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-12 h-12 bg-orange-50/20 rounded-bl-full border-b border-l border-orange-100/10" />
                        <span className="text-[10px] font-mono font-bold text-orange-700 uppercase tracking-widest block mb-1">
                          Enhancement #{idx + 1}
                        </span>
                        <h5 className="text-xs font-bold text-slate-900 leading-tight">
                          {item.title}
                        </h5>
                        <p className="text-xs text-slate-650 mt-1.5 leading-relaxed bg-white border border-slate-100/50 p-2.5 rounded-lg text-left">
                          <strong className="text-slate-900 font-semibold font-sans block text-[10px] uppercase tracking-wide mb-0.5 text-orange-600">
                            Corporate Impact:
                          </strong>
                          {item.impact}
                        </p>
                      </div>
                    ))}

                    {(!selectedProj.innovations || selectedProj.innovations.length === 0) && (
                      <p className="text-xs text-slate-400 italic py-8 text-center font-mono">No documented innovations ledgered.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Feedback repo chronological (Grid 12 - bottom split right) */}
              {!(selectedProj.hiddenSections?.includes("feedbackRepo")) && (
                <div className="lg:col-span-6 p-5 bg-white border border-slate-100 rounded-2xl shadow-3xs space-y-3 animate-fade-in">
                  <h4 className="text-xs font-mono font-bold text-slate-900 uppercase tracking-wider border-b border-slate-50 pb-2.5 flex items-center gap-1.5">
                    <MessageSquare className="h-4.5 w-4.5 text-sky-505" /> Feedback & Clarification Repository Ticker
                  </h4>

                  <div className="space-y-3.5 max-h-72 overflow-y-auto custom-scroll">
                    {selectedProj.feedbackRepo?.map((fb) => (
                      <div 
                        key={fb.id}
                        className="p-3.5 border border-slate-100 bg-slate-50/30 rounded-xl text-left font-sans"
                      >
                        <div className="flex items-center justify-between pb-1.5">
                          <span className={`px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wider border ${
                            fb.status === "Resolved" 
                              ? "bg-emerald-50 text-emerald-700 border-emerald-250" 
                              : "bg-amber-50 text-amber-700 border-amber-250"
                          }`}>
                            {fb.status}
                          </span>

                          <span className="text-[10px] font-mono text-slate-400 shrink-0">
                            Reported: {fb.reportedDate}
                          </span>
                        </div>

                        <p className="text-xs font-medium text-slate-850 pt-0.5 leading-relaxed">
                          {fb.description}
                        </p>

                        {fb.resolvedDate && (
                          <div className="mt-2.5 pt-2 border-t border-slate-150/40 text-[10px] text-slate-505 font-medium flex items-center gap-1">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                            <span>Audit Closed: {fb.resolvedDate}</span>
                          </div>
                        )}
                      </div>
                    ))}

                    {(!selectedProj.feedbackRepo || selectedProj.feedbackRepo.length === 0) && (
                      <div className="py-12 text-center">
                        <p className="text-xs text-slate-400 italic font-mono">All audit reports are verified with no pending complaints.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
