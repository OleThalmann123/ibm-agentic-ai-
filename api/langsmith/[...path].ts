/**
 * Vercel: Projekt-Root muss das Monorepo sein (nicht apps/prototyp-1-v2), sonst
 * wird diese Route nicht deployed. Env: LANGSMITH_API_KEY (required),
 * LANGSMITH_ENDPOINT (default EU), optional LANGSMITH_WORKSPACE_ID (x-tenant-id).
 * Frontend: VITE_LANGSMITH_PROXY=true, VITE_LANGSMITH_PROJECT=HSG Agentic (or override).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

const LANGSMITH_API_KEY = process.env.LANGSMITH_API_KEY;
const LANGSMITH_ENDPOINT = (
  process.env.LANGSMITH_ENDPOINT || 'https://api.smith.langchain.com'
).replace(/\/+$/, '');
const LANGSMITH_WORKSPACE_ID = process.env.LANGSMITH_WORKSPACE_ID;

function buildDownstreamPath(pathParam: string | string[] | undefined): string {
  if (Array.isArray(pathParam)) return pathParam.join('/');
  return typeof pathParam === 'string' ? pathParam : '';
}

/** Query an LangSmith weiterreichen (ohne Vercel-internes `path`). */
function buildUpstreamQuery(req: VercelRequest): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') continue;
    if (value === undefined) continue;
    const parts = Array.isArray(value) ? value : [value];
    for (const p of parts) {
      if (p !== undefined) params.append(key, String(p));
    }
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (!LANGSMITH_API_KEY) {
    res.status(500).json({ error: 'LANGSMITH_API_KEY is not configured' });
    return;
  }

  const allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  if (!allowedMethods.includes(req.method || '')) {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const downstream = buildDownstreamPath(req.query.path as string | string[] | undefined);
  const queryString = buildUpstreamQuery(req);
  const targetUrl = `${LANGSMITH_ENDPOINT}/${downstream}${queryString}`;

  const forwardHeaders: Record<string, string> = {
    'x-api-key': LANGSMITH_API_KEY,
  };

  const ct = req.headers['content-type'];
  if (ct) forwardHeaders['content-type'] = ct as string;
  else if (req.method !== 'GET' && req.method !== 'HEAD') {
    forwardHeaders['content-type'] = 'application/json';
  }

  if (req.headers['accept']) {
    forwardHeaders['accept'] = req.headers['accept'] as string;
  }

  const tenant =
    (req.headers['x-tenant-id'] as string | undefined) || LANGSMITH_WORKSPACE_ID;
  if (tenant) {
    forwardHeaders['x-tenant-id'] = tenant;
  }

  try {
    const fetchOptions: RequestInit = {
      method: req.method,
      headers: forwardHeaders,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.body !== undefined && req.body !== '') {
        fetchOptions.body =
          typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      }
    }

    const upstream = await fetch(targetUrl, fetchOptions);

    res.status(upstream.status);

    const contentType = upstream.headers.get('content-type');
    if (contentType) {
      res.setHeader('content-type', contentType);
    }

    const responseBody = await upstream.text();
    res.send(responseBody);
  } catch (err: unknown) {
    console.error('[langsmith-proxy]', err);
    res.status(502).json({
      error: 'Failed to reach LangSmith API',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
