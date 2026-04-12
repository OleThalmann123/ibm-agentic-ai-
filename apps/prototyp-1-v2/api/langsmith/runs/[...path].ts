/** Spiegel von ../../../../api/langsmith/runs/[...path].ts */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  proxyToLangSmith,
  resolveDownstreamAfterPrefix,
} from '../_shared';

const PREFIX = '/api/langsmith/runs';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const rest = resolveDownstreamAfterPrefix(req, PREFIX);
  const downstream = rest ? `runs/${rest}` : 'runs';
  await proxyToLangSmith(req, res, downstream);
}
