/**
 * Observability – Step Trace & Audit Trail
 * 
 * Records every pipeline step with timing, inputs, outputs, and metadata.
 * Provides real-time logging and persistent storage for later review.
 */

export type TraceStepType =
  | 'pdf_extraction'
  | 'tool_call'
  | 'agent_extraction'
  | 'agent_judge'
  | 'classification'
  | 'binary_mapping'
  | 'pipeline_complete'
  | 'error';

export interface TraceStep {
  id: string;
  type: TraceStepType;
  name: string;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface PipelineTrace {
  traceId: string;
  startTime: string;
  endTime?: string;
  totalDurationMs?: number;
  steps: TraceStep[];
  status: 'running' | 'completed' | 'failed';
  summary?: {
    fieldsExtracted: number;
    fieldsMissing: number;
    fieldsRequiringReview: number;
    overallConfidence: number;
    modelUsed: string;
    judgeModelUsed: string;
    toolsCalled: string[];
  };
}

let _currentTrace: PipelineTrace | null = null;
const _traceHistory: PipelineTrace[] = [];

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function startTrace(): PipelineTrace {
  _currentTrace = {
    traceId: generateId(),
    startTime: new Date().toISOString(),
    steps: [],
    status: 'running',
  };
  console.log(`[TRACE] Pipeline started: ${_currentTrace.traceId}`);
  return _currentTrace;
}

export function addTraceStep(
  type: TraceStepType,
  name: string,
  input?: Record<string, unknown>,
): TraceStep {
  if (!_currentTrace) {
    console.warn('[TRACE] No active trace – creating implicit trace');
    startTrace();
  }

  const step: TraceStep = {
    id: generateId(),
    type,
    name,
    startTime: new Date().toISOString(),
    input,
  };

  _currentTrace!.steps.push(step);
  console.log(`[TRACE] Step started: ${name} (${type})`);
  return step;
}

export function completeTraceStep(
  step: TraceStep,
  output?: Record<string, unknown>,
  metadata?: Record<string, unknown>,
): void {
  step.endTime = new Date().toISOString();
  step.durationMs = new Date(step.endTime).getTime() - new Date(step.startTime).getTime();
  step.output = output;
  step.metadata = metadata;
  console.log(`[TRACE] Step completed: ${step.name} (${step.durationMs}ms)`);
}

export function failTraceStep(step: TraceStep, error: string): void {
  step.endTime = new Date().toISOString();
  step.durationMs = new Date(step.endTime).getTime() - new Date(step.startTime).getTime();
  step.error = error;
  console.error(`[TRACE] Step failed: ${step.name} – ${error}`);
}

export function completeTrace(summary?: PipelineTrace['summary']): PipelineTrace {
  if (!_currentTrace) {
    console.warn('[TRACE] No active trace to complete');
    return { traceId: 'none', startTime: new Date().toISOString(), steps: [], status: 'completed' };
  }

  _currentTrace.endTime = new Date().toISOString();
  _currentTrace.totalDurationMs =
    new Date(_currentTrace.endTime).getTime() - new Date(_currentTrace.startTime).getTime();
  _currentTrace.status = 'completed';
  _currentTrace.summary = summary;

  console.log(
    `[TRACE] Pipeline completed: ${_currentTrace.traceId} (${_currentTrace.totalDurationMs}ms, ${_currentTrace.steps.length} steps)`,
  );

  _traceHistory.push({ ..._currentTrace });
  const result = _currentTrace;
  _currentTrace = null;
  return result;
}

export function failTrace(error: string): PipelineTrace {
  if (!_currentTrace) {
    console.warn('[TRACE] No active trace to fail');
    return { traceId: 'none', startTime: new Date().toISOString(), steps: [], status: 'failed' };
  }

  _currentTrace.endTime = new Date().toISOString();
  _currentTrace.totalDurationMs =
    new Date(_currentTrace.endTime).getTime() - new Date(_currentTrace.startTime).getTime();
  _currentTrace.status = 'failed';

  const errorStep = addTraceStep('error', 'Pipeline Error');
  failTraceStep(errorStep, error);

  _traceHistory.push({ ..._currentTrace });
  const result = _currentTrace;
  _currentTrace = null;
  return result;
}

export function getCurrentTrace(): PipelineTrace | null {
  return _currentTrace;
}

export function getTraceHistory(): PipelineTrace[] {
  return [..._traceHistory];
}

export function getTraceById(traceId: string): PipelineTrace | undefined {
  return _traceHistory.find((t) => t.traceId === traceId);
}
