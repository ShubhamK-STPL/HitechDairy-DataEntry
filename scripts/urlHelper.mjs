import dotenv from 'dotenv';

dotenv.config();

/**
 * Combines BASE_URL with a relative *_PAGE path (or returns full URL if provided).
 */
export function resolvePortalUrl(pageOrFullUrl, defaultPage) {
  const baseUrl = (process.env.BASE_URL || '').replace(/\/+$/, '');
  const raw = (pageOrFullUrl || defaultPage || '').trim();
  if (!raw) return baseUrl;
  if (/^https?:\/\//i.test(raw)) return raw;
  const pagePath = raw.startsWith('/') ? raw : `/${raw}`;
  return baseUrl ? `${baseUrl}${pagePath}` : pagePath;
}
