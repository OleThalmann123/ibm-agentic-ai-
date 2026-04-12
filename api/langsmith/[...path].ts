import type { VercelRequest, VercelResponse } from '@vercel/node';

const LANGSMITH_API_KEY = process.env.LANGSMITH_API_KEY;
const LANGSMITH_ENDPOINT =
  process.env.LANGSMITH_ENDPOINT || 'https://eu.api.smith.langchain.com';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (!LANGSMITH_API_KEY) {
    res.status(500).json({ error: 'LANGSMITH_API_KEY is not configured' });
    return;
  }

  const allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  if (!allowedMethods.includes(req.method || '')) {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const pathSegments = req.query.path;
  const downstream = Array.isArray(pathSegments)
    ? pathSegments.join('/')
    : pathSegments || '';

  const targetUrl = `${LANGSMITH_ENDPOINT}/${downstream}`;

  const forwardHeaders: Record<string, string> = {
    'x-api-key': LANGSMITH_API_KEY,
    'content-type': req.headers['content-type'] || 'application/json',
  };
  if (req.headers['accept']) {
    forwardHeaders['accept'] = req.headers['accept'] as string;
  }

  try {
    const fetchOptions: RequestInit = {
      method: req.method,
      headers: forwardHeaders,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOptions.body =
        typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
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
