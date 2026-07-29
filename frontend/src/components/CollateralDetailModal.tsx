/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { X, Download, FileText, LayoutTemplate, Film, CheckCircle2, AlertOctagon, TrendingUp, Cpu, Play, RefreshCw, Eye } from "lucide-react";
import { Collateral } from "../../../shared/types";
import { motion } from "motion/react";

interface CollateralDetailModalProps {
  collateral: Collateral | null;
  onClose: () => void;
}

export function CollateralDetailModal({ collateral, onClose }: CollateralDetailModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!collateral) return null;

  // Render file Icons based on document names
  const getFileIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.endsWith(".mp4") || lower.endsWith(".mov") || lower.endsWith(".avi")) {
      return <Film className="h-5 w-5 text-orange-500" />;
    }
    if (lower.endsWith(".ppt") || lower.endsWith(".pptx") || lower.endsWith(".key")) {
      return <LayoutTemplate className="h-5 w-5 text-amber-500" />;
    }
    return <FileText className="h-5 w-5 text-emerald-500" />;
  };

  // Highly-crafted Markdown renderer helper that transforms sections into premium bento grids
  const renderStyledCaseStudy = (content: string) => {
    if (!content) return null;

    // Split content by h2 structures to extract blocks
    const parts = content.split(/(?=^##\s+)/m);
    
    // Fallback if split fails or content is not structured in standard headers
    if (parts.length < 2) {
      return (
        <div className="prose prose-slate max-w-none text-sm text-slate-600 leading-relaxed whitespace-pre-line bg-slate-50 p-6 rounded-2xl border border-slate-100">
          {content}
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {parts.map((part, index) => {
          const lines = part.trim().split("\n");
          const titleLine = lines[0] || "";
          const bodyLines = lines.slice(1);
          const bodyText = bodyLines.join("\n").trim();

          const cleanTitle = titleLine.replace(/^##\s+/, "").trim();

          // Decide block visuals based on header identifiers
          if (cleanTitle.includes("About") || cleanTitle.includes("🏢")) {
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-slate-900" />
                <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900 font-display mb-3 uppercase tracking-wider">
                  <span className="p-1 px-1.5 rounded-md bg-slate-50 border border-slate-100">🏢</span>
                  Corporate Background & Demographics
                </h4>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{bodyText}</p>
              </motion.div>
            );
          }

          if (cleanTitle.includes("Problem") || cleanTitle.includes("⚠️")) {
            // Render bullet points as red alert cards
            const bullets = bodyText
              .split(/^[*\-]\s+/m)
              .map((b) => b.trim())
              .filter(Boolean);

            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-rose-50/40 rounded-2xl border border-rose-100 p-6 shadow-xs"
              >
                <h4 className="flex items-center gap-2 text-sm font-semibold text-rose-900 font-display mb-4 uppercase tracking-wider">
                  <span className="p-1 px-1.5 rounded-md bg-rose-50 border border-rose-100">⚠️</span>
                  Identified Obstacles & Operational Failure Modes
                </h4>
                {bullets.length > 0 ? (
                  <ul className="space-y-3">
                    {bullets.map((bullet, bIdx) => {
                      // Separate bold bullet headers
                      const boldMatch = bullet.match(/^\*\*(.*?)\*\*:(.*)/);
                      return (
                        <li key={bIdx} className="flex gap-3 text-sm text-rose-900">
                          <AlertOctagon className="h-4.5 w-4.5 text-rose-500 shrink-0 mt-0.5" />
                          <div className="leading-relaxed">
                            {boldMatch ? (
                              <span>
                                <strong className="font-semibold text-slate-800">{boldMatch[1]}</strong>: {boldMatch[2]}
                              </span>
                            ) : (
                              <span>{bullet}</span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-rose-900 leading-relaxed whitespace-pre-line">{bodyText}</p>
                )}
              </motion.div>
            );
          }

          if (cleanTitle.includes("Solution") || cleanTitle.includes("👁️")) {
            // Find code blocks containing ASCII art of layout mapping
            const codeBlockRegex = /```([\s\S]*?)```/g;
            const codeBlocks: string[] = [];
            let match;
            while ((match = codeBlockRegex.exec(bodyText)) !== null) {
              codeBlocks.push(match[1]);
            }

            const cleanBodyText = bodyText.replace(codeBlockRegex, "").trim();

            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-slate-900 text-slate-100 rounded-2xl border border-slate-800 p-6 shadow-md"
              >
                <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-200 font-display mb-4 uppercase tracking-wider">
                  <span className="p-1 px-1.5 rounded-md bg-slate-800 border border-slate-700">👁️</span>
                  Technical Architecture & Execution Path
                </h4>

                {codeBlocks.map((code, cIdx) => (
                  <div key={cIdx} className="mb-4 overflow-x-auto rounded-xl bg-slate-950 p-4 border border-slate-800 font-mono text-[11px] leading-relaxed text-emerald-400 max-w-full">
                    <pre className="whitespace-pre">{code.trim()}</pre>
                  </div>
                ))}

                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">{cleanBodyText}</p>
              </motion.div>
            );
          }

          if (cleanTitle.includes("Impact") || cleanTitle.includes("📈")) {
            // Render as green success indicators with stats
            const bulletItems = bodyText
              .split(/^[*\-]\s+/m)
              .map((i) => i.trim())
              .filter(Boolean);

            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-emerald-50/40 rounded-2xl border border-emerald-100 p-6 shadow-xs"
              >
                <h4 className="flex items-center gap-2 text-sm font-semibold text-emerald-900 font-display mb-4 uppercase tracking-wider">
                  <span className="p-1 px-1.5 rounded-md bg-emerald-50 border border-emerald-100">📈</span>
                  Business Outcomes & Key Insights
                </h4>
                {bulletItems.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {bulletItems.map((item, colIdx) => {
                      const highlightMatch = item.match(/^\*\*(.*?)\*\*:(.*)/);
                      return (
                        <div key={colIdx} className="p-4 bg-white rounded-xl border border-slate-100 shadow-3xs flex gap-3">
                          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                          <div>
                            {highlightMatch ? (
                              <div className="text-xs text-slate-600 leading-relaxed">
                                <span className="block font-display text-sm font-semibold text-emerald-950 mb-0.5">
                                  {highlightMatch[1]}
                                </span>
                                {highlightMatch[2]}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-600 leading-relaxed">{item}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-emerald-950 leading-relaxed whitespace-pre-line">{bodyText}</p>
                )}
              </motion.div>
            );
          }

          // Default section view fallback
          return (
            <div key={index} className="bg-white rounded-2xl border border-slate-150 p-6">
              <h4 className="text-sm font-semibold text-slate-900 font-display mb-3 uppercase tracking-wider">
                {cleanTitle}
              </h4>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{bodyText}</p>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div id="collateral-modal-container" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="h-full w-full bg-slate-50/98 shadow-2xl overflow-y-auto custom-scroll flex flex-col rounded-2xl border border-slate-100"
      >
        {/* Sticky Hero Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-md z-10 border-b border-slate-100 p-5 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-50 text-slate-700 border border-slate-100 rounded-xl shrink-0">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-semibold tracking-wider text-slate-400 uppercase">
                Interactive Case Profile
              </span>
              <h3 id="collateral-heading-title" className="font-display text-lg font-bold text-slate-950 tracking-tight leading-tight">
                {collateral.title}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-600 border border-transparent hover:border-slate-200 transition-all shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Scroll Body */}
        <div className="p-6 md:p-8 space-y-8 flex-1">
          {/* Render Styled Content Sections */}
          <div className="space-y-6">
            {renderStyledCaseStudy(collateral.generatedContent)}
          </div>

          {/* Reference Material Shelf & Downloads */}
          <div id="downloads-shelf" className="pt-6 border-t border-slate-150">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="font-display text-sm font-semibold text-slate-900">
                  Case Reference Documents
                </h4>
                <p className="text-xs text-slate-400">
                  Click on reference items below to download full digitized briefs and telemetry files.
                </p>
              </div>
              <span className="text-[10px] bg-slate-100 text-slate-500 font-mono px-2 py-1 rounded-sm">
                ZIP / PDF / DOCX Supported
              </span>
            </div>

            {collateral.uploadedFiles && collateral.uploadedFiles.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {collateral.uploadedFiles.map((file, fIdx) => (
                  <div
                    key={fIdx}
                    className="flex items-center justify-between p-3.5 bg-white rounded-xl border border-slate-100 hover:border-slate-250 transition-all hover:shadow-2xs group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-slate-100 transition-colors shrink-0">
                        {getFileIcon(file.name)}
                      </div>
                      <div className="text-left overflow-hidden max-w-xs">
                        <span className="block text-xs font-medium text-slate-700 truncate" title={file.name}>
                          {file.name}
                        </span>
                        <span className="block text-[10px] text-slate-400 font-mono">
                          {file.size || "Unknown Size"}
                        </span>
                      </div>
                    </div>

                    <a
                      href={file.url || "#"}
                      download
                      className="p-1.5 bg-slate-50 hover:bg-slate-900 hover:text-white rounded-lg border border-slate-150 transition-all shrink-0"
                      title="Download Brief"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center p-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <p className="text-xs text-slate-400">No telemetry source files uploaded for this portfolio entry.</p>
              </div>
            )}
          </div>
        </div>

        {/* Fixed Foot actions */}
        <div className="border-t border-slate-100 bg-white p-5 flex items-center justify-between shrink-0">
          <span className="text-[10px] font-mono text-slate-400">
            Case Entry Created: {new Date(collateral.createdAt).toLocaleDateString()}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl hover:shadow-lg transition-all shadow-slate-300"
          >
            Review Finished
          </button>
        </div>
      </motion.div>
    </div>
  );
}
