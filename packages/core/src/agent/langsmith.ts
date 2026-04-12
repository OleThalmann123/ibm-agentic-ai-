/**
 * LangSmith Integration – Browser-compatible tracing
 * 
 * Since the app runs in the browser, we can't use shell environment variables.
 * Instead, we configure the LangChainTracer programmatically and pass it
 * as a callback to all LLM invocations.
 * 
 * Configure via Vite env vars:
 *   VITE_LANGSMITH_API_KEY     – LangSmith API key (lsv2_pt_...)
 *   VITE_LANGSMITH_ENDPOINT    – API endpoint (https://eu.api.smith.langchain.com for EU)
 *   VITE_LANGSMITH_PROJECT     – Project name (default: "asklepios-agent")
 */

import { CallbackManager } from '@langchain/core/callbacks/manager';
import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain';
import { Client } from 'langsmith';
import type { RunTree } from 'langsmith/run_trees';

let _tracer: LangChainTracer | null = null;
let _client: Client | null = null;

/** Parent-Run der Pipeline — gesetzt in pipeline.ts, damit LLM-Calls darunter hängen (ohne Node-`traceable`). */
let _pipelineLangSmithRoot: RunTree | null = null;

export function setPipelineLangSmithRoot(run: RunTree | null): void {
  _pipelineLangSmithRoot = run;
}

function getPipelineLangSmithRoot(): RunTree | null {
  return _pipelineLangSmithRoot;
}

/**
 * Entspricht langsmith/langchain getLangchainCallbacks(runTree), ohne Import von
 * langsmith/langchain (das zieht traceable/node:async_hooks ins Browser-Bundle).
 */
async function getLangchainCallbacksForParentRun(
  runTree: RunTree,
): Promise<CallbackManager | undefined> {
  let callbacks = await CallbackManager.configure();
  if (!callbacks && runTree.tracingEnabled !== false) {
    callbacks = new CallbackManager();
  }
  let langChainTracer = callbacks?.handlers.find(
    (h: { name?: string }) => h?.name === 'langchain_tracer',
  ) as LangChainTracer | undefined;
  if (!langChainTracer && runTree.tracingEnabled !== false) {
    langChainTracer = new LangChainTracer();
    callbacks?.addHandler(langChainTracer);
  }

  const runMap = new Map<string, RunTree>();
  let rootRun: RunTree = runTree;
  const rootVisited = new Set<string>();
  while (rootRun.parent_run) {
    if (rootVisited.has(rootRun.id)) break;
    rootVisited.add(rootRun.id);
    rootRun = rootRun.parent_run;
  }
  const queue: RunTree[] = [rootRun];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.id)) continue;
    visited.add(current.id);
    runMap.set(current.id, current);
    if (current.child_runs?.length) {
      queue.push(...current.child_runs);
    }
  }

  if (callbacks != null) {
    Object.assign(callbacks, { _parentRunId: runTree.id });
  }
  if (langChainTracer != null) {
    const tracerAny = langChainTracer as LangChainTracer & {
      updateFromRunTree?: (rt: RunTree) => void;
      runMap?: Map<string, RunTree>;
      client?: Client;
      projectName?: string;
      exampleId?: string;
    };
    if (typeof tracerAny.updateFromRunTree === 'function') {
      tracerAny.updateFromRunTree(runTree);
    } else {
      Object.assign(langChainTracer, {
        runMap,
        client: runTree.client,
        projectName: runTree.project_name || tracerAny.projectName,
        exampleId: runTree.reference_example_id || tracerAny.exampleId,
      });
    }
  }
  return callbacks;
}

function getLangSmithConfig() {
  const apiKey = import.meta.env.VITE_LANGSMITH_API_KEY;
  const endpoint = import.meta.env.VITE_LANGSMITH_ENDPOINT || 'https://eu.api.smith.langchain.com';
  const project = import.meta.env.VITE_LANGSMITH_PROJECT || 'asklepios-agent';

  return { apiKey, endpoint, project };
}

export function isLangSmithEnabled(): boolean {
  return !!import.meta.env.VITE_LANGSMITH_API_KEY;
}

export function getLangSmithClient(): Client | null {
  if (_client) return _client;

  const config = getLangSmithConfig();
  if (!config.apiKey) return null;

  _client = new Client({
    apiKey: config.apiKey,
    apiUrl: config.endpoint,
  });

  return _client;
}

export function getLangSmithTracer(): LangChainTracer | null {
  if (_tracer) return _tracer;

  const config = getLangSmithConfig();
  if (!config.apiKey) {
    console.log('[LangSmith] Tracing disabled – no VITE_LANGSMITH_API_KEY set');
    return null;
  }

  const client = getLangSmithClient();
  if (!client) return null;

  _tracer = new LangChainTracer({
    projectName: config.project,
    client,
  });

  console.log(`[LangSmith] Tracing enabled → project "${config.project}" at ${config.endpoint}`);
  return _tracer;
}

/**
 * Get callbacks config for LLM invocations.
 * Includes tracer + run metadata so Agent 1 and Agent 2 appear
 * as distinct, labeled runs in LangSmith.
 */
export type LangSmithAgentLabel = 'asklepios-extractor' | 'asklepios-control';

const AGENT_LABELS: Record<
  LangSmithAgentLabel,
  { name: string; tags: string[] }
> = {
  'asklepios-extractor': {
    name: 'Asklepios Extractor: Datenextraktion',
    tags: ['asklepios', 'extractor', 'tools'],
  },
  'asklepios-control': {
    name: 'Asklepios Control: Qualitätsprüfung',
    tags: ['asklepios', 'control', 'judge', 'quality-check'],
  },
};

export function getLangSmithCallbacks(
  agentName: LangSmithAgentLabel,
  metadata?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const tracer = getLangSmithTracer();
  if (!tracer) return undefined;

  const label = AGENT_LABELS[agentName] ?? { name: agentName, tags: [agentName] };

  return {
    callbacks: [tracer],
    runName: label.name,
    tags: label.tags,
    metadata: {
      agent: agentName,
      ...metadata,
    },
  };
}

/**
 * Callback-Konfiguration für model.invoke — bevorzugt verschachtelte Runs unter
 * dem Pipeline-Parent-Run (RunTree in runDocumentPipeline), sonst flacher Fallback.
 */
export async function getLangSmithInvokeConfig(
  agentName: LangSmithAgentLabel,
  metadata?: Record<string, unknown>,
): Promise<Record<string, unknown> | undefined> {
  const label = AGENT_LABELS[agentName] ?? { name: agentName, tags: [agentName] };
  const meta = { agent: agentName, ...metadata };

  if (!isLangSmithEnabled()) {
    return undefined;
  }

  const parentTree = getPipelineLangSmithRoot();
  if (parentTree) {
    try {
      const callbacks = await getLangchainCallbacksForParentRun(parentTree);
      if (callbacks) {
        return {
          callbacks,
          runName: label.name,
          tags: label.tags,
          metadata: meta,
        };
      }
    } catch (e) {
      console.warn('[LangSmith] Nested callbacks failed, using flat tracer', e);
    }
  }

  return getLangSmithCallbacks(agentName, metadata);
}
