/** Spiegel von ../../../../../api/langsmith/runs/[...slug].ts */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { proxyToLangSmith } from '../../_langsmithProxyShared';

function slugList(req: VercelRequest): string[] {
  const s = req.query.slug;
  if (s == null || s === '') return [];
  if (Array.isArray(s)) {
    return (s as string[]).flatMap((x) => String(x).split('/')).filter(Boolean);
  }
  return String(s).split('/').filter(Boolean);
}

function slugFromUrl(req: VercelRequest): string[] {
  const pathname = (req.url || '').split('?')[0];
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const base = '/api/langsmith/runs';
  if (!normalized.startsWith(base)) return [];
  const rest = normalized.slice(base.length).replace(/^\//, '');
  if (!rest) return [];
  return rest.split('/').filter(Boolean);
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  let parts = slugList(req);
  if (parts.length === 0) parts = slugFromUrl(req);
  const downstream = ['runs', ...parts].join('/');
  await proxyToLangSmith(req, res, downstream);
}
