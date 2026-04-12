/**
 * LangSmith-Proxy unter /api/langsmith/* (Vercel-konformes Catch-All).
 * Ersetzt api/[[...segments]].ts — zuverlässigeres Routing auf Production-Domains.
 * Spiegel: apps/prototyp-1-v2/api/langsmith/[...path].ts
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { proxyToLangSmith } from '../_langsmithProxyShared';

function pathList(req: VercelRequest): string[] {
  const s = req.query.path;
  if (s == null || s === '') return [];
  if (Array.isArray(s)) {
    return (s as string[]).flatMap((x) => String(x).split('/')).filter(Boolean);
  }
  return String(s).split('/').filter(Boolean);
}

function pathFromUrl(req: VercelRequest): string[] {
  const pathname = (req.url || '').split('?')[0];
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const base = '/api/langsmith';
  if (!normalized.startsWith(base)) return [];
  const rest = normalized.slice(base.length).replace(/^\//, '');
  if (!rest) return [];
  return rest.split('/').filter(Boolean);
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  let parts = pathList(req);
  if (parts.length === 0) parts = pathFromUrl(req);
  const downstream = parts.join('/');
  await proxyToLangSmith(req, res, downstream);
}
