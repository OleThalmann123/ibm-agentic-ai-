/**
 * Vercel: ein Segment unter /api/langsmith/* (z. B. info, runs).
 * Mehrsegment-Pfade unter …/runs/* liegen in ./runs/[...path].ts (Vercel-Routing).
 *
 * Spiegel: apps/prototyp-1-v2/api/langsmith/
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  proxyToLangSmith,
  resolveDownstreamAfterPrefix,
} from './_shared';

const PREFIX = '/api/langsmith';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const downstream = resolveDownstreamAfterPrefix(req, PREFIX);
  await proxyToLangSmith(req, res, downstream);
}
