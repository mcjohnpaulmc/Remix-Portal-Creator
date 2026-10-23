/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { UserLog } from "../../../shared/types";
import { Search, Download, ChevronDown, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

interface AdminLogsProps {
  logs: UserLog[];
  onReload?: () => Promise<void>;
}

export function AdminLogs({ logs, onReload }: AdminLogsProps) {
  const [search, setSearch] = useState("");
  const [subdomainFilter, setSubdomainFilter] = useState<string[]>([]);
  const [showSubdomainDropdown, setShowSubdomainDropdown] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSubdomainDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const uniqueSubdomains = Array.from(
    new Set(logs.map((l) => l.subdomain).filter((s): s is string => !!s))
  ).sort();

  const filteredLogs = logs.filter((log) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (log.email && log.email.toLowerCase().includes(q)) ||
      (log.action && log.action.toLowerCase().includes(q)) ||
      (log.details && log.details.toLowerCase().includes(q)) ||
      (log.subdomain && log.subdomain.toLowerCase().includes(q));
    const matchesSubdomain =
      subdomainFilter.length === 0 ||
      (log.subdomain ? subdomainFilter.includes(log.subdomain) : false);
    return matchesSearch && matchesSubdomain;
  });

  // Pagination — the log is append-only and grows without bound, so rendering it
  // whole eventually means thousands of rows in one DOM pass.
  const ROWS_PER_PAGE = 100;
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(filteredLogs.length / ROWS_PER_PAGE));
  // Searching or filtering changes what page 0 even means, and leaving the index
  // where it was would strand the view on a page past the end of the new results.
  useEffect(() => {
    setPage(0);
  }, [search, subdomainFilter]);
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * ROWS_PER_PAGE;
  const visibleLogs = filteredLogs.slice(pageStart, pageStart + ROWS_PER_PAGE);

  // Calculate quick metrics
  const uniqueEmails = Array.from(new Set(logs.map((l) => l.email).filter(Boolean)));
  const accessGrantedCount = logs.filter(
    (l) => l.action?.includes("Access Granted") || l.action?.includes("Login")
  ).length;
  const uniqueDomains = Array.from(
    new Set(
      logs
        .map((l) => l.email)
        .filter((e) => e && e.includes("@"))
        .map((e) => e.split("@")[1])
    )
  );

  const handleExportCSV = () => {
    const headers = ["Email", "Action Event", "Subdomain", "Operations Log / Details", "Date"];
    const rows = filteredLogs.map((log) => [
      log.email || "",
      log.action || "",
      log.subdomain || "",
      log.details || "",
      new Date(log.date).toLocaleString(),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `visitor-telemetry-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div id="admin-logs-view" className="space-y-6">
      {/* Metrics board */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white border border-slate-100 rounded-xl shadow-3xs flex flex-col justify-between">
          <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold">Total Audited Events</span>
          <span className="font-display font-bold text-xl text-slate-900 mt-2 flex items-baseline gap-1.5">
            {logs.length} <span className="text-xs font-normal text-slate-400">records</span>
          </span>
        </div>

        <div className="p-4 bg-white border border-slate-100 rounded-xl shadow-3xs flex flex-col justify-between">
          <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold">Workspace Access Logs</span>
          <span className="font-display font-bold text-xl text-slate-900 mt-2 flex items-baseline gap-1.5">
            {accessGrantedCount} <span className="text-xs font-normal text-slate-400">granted</span>
          </span>
        </div>

        <div className="p-4 bg-white border border-slate-100 rounded-xl shadow-3xs flex flex-col justify-between">
          <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold">Unique Users Logs</span>
          <span className="font-display font-bold text-xl text-slate-900 mt-2 flex items-baseline gap-1.5">
            {uniqueEmails.length} <span className="text-xs font-normal text-slate-400">people</span>
          </span>
        </div>

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
        {onReload && (
          <button
            onClick={async () => {
              setRefreshing(true);
              try { await onReload(); } finally { setRefreshing(false); }
            }}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-600 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-50 shrink-0"
            title="Reload visitor telemetry from server"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        )}
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-700 text-white rounded-lg text-[11px] font-semibold transition-colors shrink-0"
        >
          <Download className="h-3.5 w-3.5" />
          Export Data
        </button>
      </div>

      {/* Table block */}
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-3xs">
        <div className="overflow-x-auto custom-scroll">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-mono text-slate-400 uppercase">
                <th className="py-3 px-4.5 font-bold">Authenticated User / Email</th>
                <th className="py-3 px-4 font-bold">Action Event</th>
                {/* Subdomain column header with dropdown filter */}
                <th className="py-3 px-4 font-bold">
                  <div ref={dropdownRef} className="relative inline-block">
                    <button
                      type="button"
                      onClick={() => setShowSubdomainDropdown((v) => !v)}
                      className={`flex items-center gap-1 hover:text-slate-700 transition-colors ${
                        subdomainFilter.length > 0 ? "text-orange-600" : ""
                      }`}
                    >
                      Subdomain
                      {subdomainFilter.length > 0 && (
                        <span className="bg-orange-500 text-white rounded-full text-[8px] px-1 leading-tight font-bold">
                          {subdomainFilter.length}
                        </span>
                      )}
                      <ChevronDown className="h-3 w-3" />
                    </button>

                    {showSubdomainDropdown && (
                      <div className="absolute top-full left-0 z-20 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg p-2 min-w-40">
                        {uniqueSubdomains.length === 0 ? (
                          <p className="text-[10px] text-slate-400 px-2 py-1">No subdomains logged yet</p>
                        ) : (
                          <>
                            {uniqueSubdomains.map((sub) => (
                              <label
                                key={sub}
                                className="flex items-center gap-2 text-[11px] font-normal normal-case tracking-normal px-2 py-1.5 cursor-pointer hover:bg-slate-50 rounded"
                              >
                                <input
                                  type="checkbox"
                                  checked={subdomainFilter.includes(sub)}
                                  onChange={() =>
                                    setSubdomainFilter((prev) =>
                                      prev.includes(sub)
                                        ? prev.filter((s) => s !== sub)
                                        : [...prev, sub]
                                    )
                                  }
                                  className="h-3 w-3 accent-orange-500"
                                />
                                <span className="text-slate-700 font-mono">{sub}</span>
                              </label>
                            ))}
                            {subdomainFilter.length > 0 && (
                              <button
                                onClick={() => setSubdomainFilter([])}
                                className="w-full mt-1 text-[10px] text-slate-500 hover:text-slate-800 text-left px-2 py-1 border-t border-slate-100 normal-case tracking-normal"
                              >
                                Clear filter
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </th>
                <th className="py-3 px-4 font-bold">Operations Logs / Details</th>
                <th className="py-3 px-4.5 font-bold">Date & Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-mono">
              {visibleLogs.map((log) => {
                const isGatewayEvent =
                  log.action?.includes("Granted") || log.action?.includes("Login");
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
                    <td className="py-3 px-4 text-slate-500">
                      {log.subdomain ? (
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-mono">
                          {log.subdomain}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
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
                  <td colSpan={5} className="text-center py-8 text-slate-400 font-mono">
                    No matching logs available for this database snapshot.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pager — only earns its space once there is more than one page. */}
        {filteredLogs.length > ROWS_PER_PAGE && (
          <div className="flex items-center justify-between gap-3 px-4.5 py-3 border-t border-slate-100 flex-wrap">
            <span className="text-[11px] font-mono text-slate-400">
              Showing <span className="text-slate-700 font-bold">{pageStart + 1}</span>–
              <span className="text-slate-700 font-bold">{pageStart + visibleLogs.length}</span> of{" "}
              <span className="text-slate-700 font-bold">{filteredLogs.length}</span> entries
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(0)}
                disabled={safePage === 0}
                className="px-2.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-[11px] font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                First
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-[11px] font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </button>
              <span className="text-[11px] font-mono text-slate-500 px-1">
                Page {safePage + 1} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={safePage >= pageCount - 1}
                className="flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-[11px] font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPage(pageCount - 1)}
                disabled={safePage >= pageCount - 1}
                className="px-2.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-[11px] font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
