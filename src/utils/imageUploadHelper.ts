import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { resolvePortalUrl } from '../config/envConfig';

export const DEFAULT_LOGO_ROUTE = '/assets/images/default-logo.png';

interface CachedRemoteImage {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

const remoteImageCache = new Map<string, CachedRemoteImage>();

/**
 * Returns the default portal logo URL: `${BASE_URL}/assets/images/default-logo.png`.
 */
export function getDefaultLogoUrl(): string {
  return resolvePortalUrl(DEFAULT_LOGO_ROUTE);
}

/**
 * Resolves the image path from Excel, falling back to `${BASE_URL}/assets/images/default-logo.png`
 * when no image is provided in Excel.
 */
export function resolveProductOrVariantImage(imagePath?: string): string {
  const trimmed = (imagePath || '').trim();
  return trimmed || getDefaultLogoUrl();
}

function inferMimeType(fileName: string, contentTypeHeader?: string): string {
  if (contentTypeHeader && contentTypeHeader.startsWith('image/')) {
    return contentTypeHeader.split(';')[0].trim();
  }
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.svg') return 'image/svg+xml';
  return 'image/png';
}

async function fetchRemoteImage(page: Page, url: string): Promise<CachedRemoteImage> {
  const cached = remoteImageCache.get(url);
  if (cached) return cached;

  const response = await page.request.get(url);
  if (!response.ok()) {
    throw new Error(`Failed to fetch image from ${url} (HTTP ${response.status()})`);
  }

  const buffer = await response.body();
  let fileName = 'default-logo.png';
  try {
    const parsed = new URL(url);
    const base = path.posix.basename(parsed.pathname);
    if (base) fileName = base;
  } catch {
    // keep default filename
  }

  const mimeType = inferMimeType(fileName, response.headers()['content-type']);
  const entry: CachedRemoteImage = { name: fileName, mimeType, buffer };
  remoteImageCache.set(url, entry);
  return entry;
}

/**
 * Uploads an image to a file input locator from either an HTTP(S) URL or a local file path.
 * Falls back to `${BASE_URL}/assets/images/default-logo.png` if `imagePath` is empty.
 */
export async function setInputFilesFromPathOrUrl(
  page: Page,
  fileInput: Locator,
  imagePath?: string,
  label: string = 'Product/Variant'
): Promise<string> {
  const targetPath = resolveProductOrVariantImage(imagePath);

  await fileInput.waitFor({ state: 'attached', timeout: 10000 });

  if (/^https?:\/\//i.test(targetPath)) {
    const payload = await fetchRemoteImage(page, targetPath);
    await fileInput.setInputFiles(payload);
    return targetPath;
  }

  const resolvedPath = path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(process.cwd(), targetPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`${label} image is mandatory, but image file was not found at: ${resolvedPath}`);
  }

  await fileInput.setInputFiles(resolvedPath);
  return resolvedPath;
}
