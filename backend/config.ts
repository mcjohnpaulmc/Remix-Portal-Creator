/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import path from "path";

export const PORT = parseInt(process.env.PORT || "3000", 10);
export const S3_BUCKET = "asg-bot-cache";
export const S3_PREFIX = "Mobius_Portal_Creator_Hub";
export const AWS_REGION = process.env.AWS_REGION || "ap-south-1";
export const PORTAL_PORT_BASE = 5000;
export const DATA_DIR = path.join(process.cwd(), "data");
export const DATA_FILE = path.join(DATA_DIR, "data-store.json");
export const UPLOADS_DIR = path.join(process.cwd(), "uploads");
export const PORTALS_DIR = path.join(DATA_DIR, "portals");
export const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "";
export const JWT_SECRET = process.env.JWT_SECRET || "";
export const SYSTEM_ADMIN_EMAIL = "eswar@xtract.io";
export const BCRYPT_ROUNDS = 10;
export const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || "";
export const SERVER_PUBLIC_IP = process.env.SERVER_PUBLIC_IP || "";
