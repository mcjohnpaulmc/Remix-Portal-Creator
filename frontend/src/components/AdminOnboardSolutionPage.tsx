/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { PlusCircle, Rocket, Link2 } from "lucide-react";
import { Solution, Collateral, SubdomainPortal } from "../../../shared/types";
import { AdminSolutions } from "./AdminSolutions";
import { DeploySolutionForm } from "./DeploySolutionForm";

interface AdminOnboardSolutionPageProps {
  solutions: Solution[];
  collaterals?: Collateral[];
  subdomains: SubdomainPortal[];
  onRefresh: (action: string, solutionData: any) => Promise<void>;
  onReload?: () => Promise<void>;
  adminUserEmail?: string;
  // Set when arriving via the "Onboard Assets for this Portal" shortcut — opens
  // the Onboard popup immediately with Step 1 pre-checked for that portal.
  initialPortal?: string | null;
}

export function AdminOnboardSolutionPage({
  solutions,
  collaterals = [],
  subdomains,
  onRefresh,
  onReload,
  adminUserEmail = "",
  initialPortal = null,
}: AdminOnboardSolutionPageProps) {
  const [openPopup, setOpenPopup] = useState<"onboard" | "deploy" | null>(null);
  const subdomainProp = subdomains.map((s) => ({ id: s.id, name: s.name, displayName: s.displayName }));

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-base font-bold text-slate-900 leading-tight">
          Onboard Solution
        </h3>
        <p className="text-xs text-slate-500">
          Add a brand-new solution to the catalogue, or deploy a standalone HTML app to its own subdomain.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {openPopup !== "onboard" && (
          <motion.button
            layoutId="onboard-solution-card"
            type="button"
            onClick={() => setOpenPopup("onboard")}
            className="text-left p-5 bg-white border border-slate-200 rounded-2xl shadow-xs hover:shadow-md hover:border-orange-300 transition-shadow duration-200 cursor-pointer flex items-center gap-4"
          >
            <div className="h-10 w-10 shrink-0 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center">
              <PlusCircle className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <h4 className="text-base font-bold text-orange-600">Onboard Solution</h4>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                Manually register a solution, or import one from Mobius / TechMobius / the Hub Repository.
              </p>
            </div>
          </motion.button>
        )}

        {openPopup !== "deploy" && (
          <motion.button
            layoutId="deploy-solution-card"
            type="button"
            onClick={() => setOpenPopup("deploy")}
            className="text-left p-5 bg-gradient-to-br from-slate-900 to-blue-950 border border-blue-900/50 rounded-2xl shadow-md hover:shadow-lg transition-shadow duration-200 cursor-pointer flex items-center gap-4"
          >
            <div className="h-10 w-10 shrink-0 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center">
              <Rocket className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <h4 className="text-base font-bold text-orange-400">Deploy Solution</h4>
              <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                Upload a self-contained HTML app and host it on its own subdomain.
              </p>
            </div>
          </motion.button>
        )}
      </div>

      {/* Solution Repository — every solution in the hub, regardless of how many
          portals (if any) it's currently mapped to. */}
      <div>
        <h3 className="font-display text-base font-bold text-slate-900 leading-tight">
          Solution Repository
        </h3>
        <p className="text-xs text-slate-500 mb-3">
          Every solution onboarded to the hub — a solution can be mapped to more than one portal from the Map Solutions page.
        </p>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 text-[10px] font-mono uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Solution Name</th>
                <th className="px-4 py-2.5 font-semibold">URL</th>
                <th className="px-4 py-2.5 font-semibold text-right">Collaterals</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {solutions.map((sol) => {
                const collateralCount = collaterals.filter((c) => c.linkedSolutionId === sol.id).length;
                return (
                  <tr key={sol.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-2.5 font-semibold text-slate-800 truncate max-w-[260px]">{sol.title}</td>
                    <td className="px-4 py-2.5 text-slate-500 font-mono truncate max-w-[320px]">
                      {sol.url ? (
                        <a
                          href={sol.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                        >
                          <Link2 className="h-3 w-3 shrink-0" />
                          <span className="truncate">{sol.url}</span>
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{collateralCount}</td>
                  </tr>
                );
              })}
              {solutions.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-400 font-mono">
                    No solutions onboarded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {openPopup === "onboard" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setOpenPopup(null)}
          >
            <motion.div
              layoutId="onboard-solution-card"
              className="w-full max-w-6xl max-h-[88vh] overflow-y-auto rounded-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <AdminSolutions
                solutions={solutions}
                hubRepositorySolutions={solutions}
                collaterals={collaterals}
                subdomains={subdomainProp}
                prefilledSubdomain={initialPortal}
                onRefresh={onRefresh}
                onReload={onReload}
                adminUserEmail={adminUserEmail}
                onClose={() => setOpenPopup(null)}
              />
            </motion.div>
          </motion.div>
        )}

        {openPopup === "deploy" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setOpenPopup(null)}
          >
            <motion.div
              layoutId="deploy-solution-card"
              className="w-full max-w-4xl max-h-[88vh] overflow-y-auto rounded-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <DeploySolutionForm
                subdomains={subdomainProp}
                onReload={onReload}
                onClose={() => setOpenPopup(null)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
