import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * ---------------------------------------------------------------------------
 * File storage
 * ---------------------------------------------------------------------------
 * Two drivers are supported:
 *   'local'    - writes to ./public/uploads (development / self-hosted Node).
 *   'disabled' - rejects every upload.
 *
 * Vercel's filesystem is read-only and ephemeral, so production deployments on
 * Vercel MUST switch to a durable store. Adding one is a single function: copy
 * `saveToLocal`, replace the body with the Vercel Blob / S3 call and return its
 * public URL. Nothing else in the app reads from disk.
 */

const ALLOWED_MIME = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['application/pdf', '.pdf'],
]);

export const MAX_FILE_SIZE_MB = Number(process.env.STORAGE_MAX_FILE_SIZE_MB ?? 5);
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export class StorageError extends Error {
  constructor(message, code = 'STORAGE_ERROR') {
    super(message);
    this.name = 'StorageError';
    this.code = code;
  }
}

export function isAllowedMime(mimeType) {
  return ALLOWED_MIME.has(String(mimeType ?? '').toLowerCase());
}

/**
 * Validates a browser File object. Returns a safe stored name + public URL.
 *
 * Defence in depth:
 *   1. allow-list of MIME types (never trust the browser's `type`);
 *   2. size ceiling;
 *   3. extension derived from the MIME type, never from `file.name`;
 *   4. random filename so a hostile name can never traverse directories;
 *   5. the stored name is additionally checked before touching the filesystem.
 */
export async function storeUpload(file, folder = 'uploads') {
  const driver = process.env.STORAGE_DRIVER ?? 'local';

  if (driver === 'disabled') {
    throw new StorageError('File uploads are disabled on this server.', 'DISABLED');
  }
  if (!file || typeof file !== 'object' || typeof file.arrayBuffer !== 'function') {
    throw new StorageError('No file was provided.', 'NO_FILE');
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new StorageError(
      `File is too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`,
      'TOO_LARGE',
    );
  }
  const mimeType = String(file.type ?? '').toLowerCase();
  if (!isAllowedMime(mimeType)) {
    throw new StorageError('Unsupported file type. Upload a JPG, PNG, WEBP, GIF or PDF.', 'BAD_TYPE');
  }

  const extension = ALLOWED_MIME.get(mimeType);
  const safeFolder = String(folder).replace(/[^a-zA-Z0-9_-]/g, '') || 'uploads';
  const storedName = `${Date.now()}-${randomBytes(8).toString('hex')}${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const publicUrl = `/uploads/${safeFolder}/${storedName}`;

  if (driver === 'local') {
    await saveToLocal(safeFolder, storedName, bytes);
  } else {
    // Unknown driver: fail loudly rather than silently dropping the file.
    throw new StorageError(`Unsupported STORAGE_DRIVER "${driver}".`, 'BAD_DRIVER');
  }

  return {
    storedName,
    url: publicUrl,
    mimeType,
    size: file.size,
    // Only the base name is kept for display - the client name can contain
    // HTML/control characters and is always escaped on render.
    fileName: sanitizeDisplayName(file.name, extension),
  };
}

async function saveToLocal(folder, storedName, bytes) {
  const baseDir = path.join(process.cwd(), 'public', 'uploads', folder);
  // Defence in depth: the resolved path must stay inside public/uploads.
  const target = path.join(baseDir, storedName);
  const normalizedBase = path.normalize(baseDir) + path.sep;
  if (!path.normalize(target).startsWith(normalizedBase)) {
    throw new StorageError('Invalid storage path.', 'BAD_PATH');
  }
  await mkdir(baseDir, { recursive: true });
  await writeFile(target, bytes);
}

function sanitizeDisplayName(name, fallbackExtension) {
  const base = String(name ?? 'upload')
    .replace(/[\\/]/g, '_')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"|?*]/g, '')
    .trim()
    .slice(0, 120);
  return base || `upload${fallbackExtension}`;
}