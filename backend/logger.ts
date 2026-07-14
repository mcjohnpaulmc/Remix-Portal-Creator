/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

type LogLevel = "info" | "warn" | "error" | "debug";

function log(level: LogLevel, tag: string, msg: string, extra?: unknown): void {
  const ts = new Date().toISOString();
  const prefix = `${ts} [${tag}]`;
  if (extra !== undefined) {
    // eslint-disable-next-line no-console
    console[level](`${prefix} ${msg}`, extra);
  } else {
    // eslint-disable-next-line no-console
    console[level](`${prefix} ${msg}`);
  }
}

export const logger = {
  info(tag: string, msg: string, extra?: unknown): void {
    log("info", tag, msg, extra);
  },
  warn(tag: string, msg: string, extra?: unknown): void {
    log("warn", tag, msg, extra);
  },
  error(tag: string, msg: string, extra?: unknown): void {
    log("error", tag, msg, extra);
  },
  debug(tag: string, msg: string, extra?: unknown): void {
    log("debug", tag, msg, extra);
  },
};
