/** Spiegel von ../../../api/[[...segments]].ts — synchron halten. */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { proxyToLangSmith } from './_langsmithProxyShared';

function segmentsList(req: VercelRequest): string[] {
  const s = req.query.segments;
  if (s == null || s === '') return [];
  if (Array.isArray(s)) {
    return (s as string[]).flatMap((x) => String(x).split('/')).filter(Boolean);
  }
  return String(s).split('/').filter(Boolean);
}

function segmentsFromUrl(req: VercelRequest): string[] {
  const pathname = (req.url || '').split('?')[0];
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (!normalized.startsWith('/api/')) return [];
  return normalized.slice('/api/'.length).split('/').filter(Boolean);
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  let parts = segmentsList(req);
  if (parts.length === 0) parts = segmentsFromUrl(req);
  if (parts.length < 1 || parts[0] !== 'langsmith') {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const downstream = parts.slice(1).join('/');
  await proxyToLangSmith(req, res, downstream);
}
