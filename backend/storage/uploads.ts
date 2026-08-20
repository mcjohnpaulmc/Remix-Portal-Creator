/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "fs";
import path from "path";
import { s3PutUpload, s3GetUpload } from "./s3";
import { UPLOADS_DIR, UPLOAD_STORAGE_MODE } from "../config";
import { logger } from "../logger";

function localFilePath(slug: string, filename: string): string {
  return path.join(UPLOADS_DIR, slug, filename);
}

// The filesystem has no equivalent of S3's stored ContentType — a sidecar
// file next to each upload records it so downloads can set the right header.
function localMetaPath(slug: string, filename: string): string {
  return path.join(UPLOADS_DIR, slug, `${filename}.contenttype`);
}

async function putLocal(slug: string, filename: string, buffer: Buffer, contentType: string): Promise<void> {
  const dir = path.join(UPLOADS_DIR, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(localFilePath(slug, filename), buffer);
  fs.writeFileSync(localMetaPath(slug, filename), contentType, "utf-8");
  logger.info("uploads", `Saved locally (UPLOAD_STORAGE_MODE=local): ${slug}/${filename}`);
}

function getLocal(slug: string, filename: string): { body: any; contentType: string | undefined } | null {
  const filePath = localFilePath(slug, filename);
  if (!fs.existsSync(filePath)) return null;
  let contentType: string | undefined;
  try {
    contentType = fs.readFileSync(localMetaPath(slug, filename), "utf-8");
  } catch {
    contentType = undefined;
  }
  return { body: fs.createReadStream(filePath), contentType };
}

// Saves to whichever backend UPLOAD_STORAGE_MODE currently points at. Switching
// modes only affects new uploads going forward — see getUpload for why existing
// files under either backend keep working regardless of the current mode.
export async function putUpload(slug: string, filename: string, buffer: Buffer, contentType: string): Promise<void> {
  if (UPLOAD_STORAGE_MODE === "local") {
    await putLocal(slug, filename, buffer, contentType);
    return;
  }
  await s3PutUpload(slug, filename, buffer, contentType);
}

// Checks the current mode's backend first, then falls back to the other one —
// so a file uploaded while UPLOAD_STORAGE_MODE was "local" still resolves after
// switching back to "s3", with no migration step required.
export async function getUpload(slug: string, filename: string): Promise<{ body: any; contentType: string | undefined } | null> {
  if (UPLOAD_STORAGE_MODE === "local") {
    return getLocal(slug, filename) || (await s3GetUpload(slug, filename));
  }
  return (await s3GetUpload(slug, filename)) || getLocal(slug, filename);
}
