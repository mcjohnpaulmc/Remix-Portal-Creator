/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { UserLog } from "../../../shared/types";
import { Search, Globe, Shield, Calendar, Terminal, Database, Download } from "lucide-react";

interface AdminLogsProps {
  logs: UserLog[];
}

export function AdminLogs({ logs }: AdminLogsProps) {
  const [search, setSearch] = useState("");

  const filteredLogs = logs.filter((log) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (log.email && log.email.toLowerCase().includes(q)) ||
      (log.action && log.action.toLowerCase().includes(q)) ||
      (log.details && log.details.toLowerCase().includes(q))
    );
  });

  // Calculate quick metrics
  const uniqueEmails = Array.from(new Set(logs.map((l) => l.email).filter(Boolean)));
  const accessGrantedCount = logs.filter((l) => l.action?.includes("Access Granted") || l.action?.includes("Login")).length;
  const uniqueDomains = Array.from(
    new Set(
      logs
        .map((l) => l.email)
        .filter((e) => e && e.includes("@"))
        .map((e) => e.split("@")[1])
    )
  );

  return (
    <div id="admin-logs-view" className="space-y-6">
      {/* Metrics board */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Events */}
        <div className="p-4 bg-white border border-slate-100 rounded-xl shadow-3xs flex flex-col justify-between">
          <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold">Total Audited Events</span>
          <span className="font-display font-bold text-xl text-slate-900 mt-2 flex items-baseline gap-1.5">
            {logs.length} <span className="text-xs font-normal text-slate-400">records</span>
          </span>
        </div>

        {/* Access sessions */}
        <div className="p-4 bg-white border border-slate-100 rounded-xl shadow-3xs flex flex-col justify-between">
          <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold">Workspace Access Logs</span>
          <span className="font-display font-bold text-xl text-slate-900 mt-2 flex items-baseline gap-1.5">
            {accessGrantedCount} <span className="text-xs font-normal text-slate-400">granted</span>
          </span>
        </div>

        {/* Unique Personnel */}
        <div className="p-4 bg-white border border-slate-100 rounded-xl shadow-3xs flex flex-col justify-between">
          <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold">Unique Users Logs</span>
          <span className="font-display font-bold text-xl text-slate-900 mt-2 flex items-baseline gap-1.5">
            {uniqueEmails.length} <span className="text-xs font-normal text-slate-400">people</span>
          </span>
        </div>

        {/* Unique corporate domains verified */}
        <div className="p-4 bg-white border border-slate-100 rounded-xl shadow-3xs flex flex-col justify-between">
          <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold">Verified Work Domains</span>
          <span className="font-display font-bold text-xl text-slate-900 mt-2 flex items-baseline gap-1.5">
            {uniqueDomains.length} <span className="text-xs font-normal text-slate-400">organizations</span>
          </span>
        </div>
      </div>

      {/* Filter and control bars */}
      <div className="flex items-center gap-3 bg-white p-3 border border-slate-100 rounded-xl shadow-3xs">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type email, action log keywords or timestamps..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-slate-800"
          />
        </div>
        {search && (
          <button
            onClick={() => setSearch("")}
            className="text-[11px] text-slate-500 hover:text-slate-800 font-semibold px-2"
          >
            Reset filter
          </button>
        )}
      </div>

      {/* Table block */}
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-3xs">
        <div className="overflow-x-auto custom-scroll">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-mono text-slate-400 uppercase">
                <th className="py-3 px-4.5 font-bold">Authenticated User / Email</th>
                <th className="py-3 px-4 font-bold">Action Event</th>
                <th className="py-3 px-4 font-bold">Operations Logs / Details</th>
                <th className="py-3 px-4.5 font-bold">Date & Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-mono">
              {filteredLogs.map((log) => {
                const isGatewayEvent = log.action?.includes("Granted") || log.action?.includes("Access");
                const isSystemEvent = log.action?.includes("System");

                return (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-4.5 font-medium text-slate-900">
                      {log.email || <span className="text-slate-400">anonymous</span>}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-sm font-semibold text-[9px] uppercase tracking-wide ${
                          isGatewayEvent
                            ? "bg-emerald-50 text-emerald-700 text-[8px]"
                            : isSystemEvent
                            ? "bg-slate-100 text-slate-700"
                            : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-sans break-all max-w-xs md:max-w-md">
                      {log.details}
                    </td>
                    <td className="py-3 px-4.5 text-slate-400 whitespace-nowrap text-[10px]">
                      {new Date(log.date).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-slate-400 font-mono">
                    No matching logs available for this database snapshot.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
