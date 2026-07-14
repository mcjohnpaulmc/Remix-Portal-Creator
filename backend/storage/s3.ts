/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { S3_BUCKET, S3_PREFIX, AWS_REGION } from "../config";
import { logger } from "../logger";
import { InternalUser } from "./db";

export const s3 = new S3Client({ region: AWS_REGION });

export async function loadUsersFromS3(): Promise<InternalUser[] | null> {
  const key = `${S3_PREFIX}/users.json`;
  try {
    const resp = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    const body = await (resp.Body as any).transformToString();
    const { users } = JSON.parse(body);
    if (Array.isArray(users)) {
      logger.info("S3", `Loaded ${users.length} users from users.json`);
      return users as InternalUser[];
    }
  } catch (err: any) {
    logger.warn("S3", `Could not load users.json (will use local DB): ${err?.message || err}`);
  }
  return null;
}

export async function s3PutPortalFile(slug: string, filename: string, content: object): Promise<void> {
  const key = `${S3_PREFIX}/${slug}/${filename}`;
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: JSON.stringify(content, null, 2),
    ContentType: "application/json",
  }));
  logger.info("S3", `Uploaded s3://${S3_BUCKET}/${key}`);
}

export async function s3GetPortalFile(slug: string, filename: string): Promise<any> {
  const key = `${S3_PREFIX}/${slug}/${filename}`;
  try {
    const resp = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    const body = await (resp.Body as any).transformToString();
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export async function s3SyncUsers(users: InternalUser[]): Promise<void> {
  const key = `${S3_PREFIX}/users.json`;
  const payload = {
    updatedAt: new Date().toISOString(),
    users: users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      enabled: u.enabled !== false,
      createdAt: u.createdAt,
      passwordHash: u.passwordHash,
    })),
  };
  try {
    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: JSON.stringify(payload, null, 2),
      ContentType: "application/json",
    }));
    logger.info("S3", `Synced ${users.length} users → s3://${S3_BUCKET}/${key}`);
  } catch (err: any) {
    logger.error("S3", `Failed to sync users.json: ${err?.message}`);
  }
}
