/**
 * IDP Pipeline – Agentic Workflow
 * 
 * New architecture (Meeting Decisions #2, #4, #5, #10):
 * 
 * Step 1: PDF/Document Extraction (Tool: read_document)
 * Step 2: Agent 1 – Data Extraction with Tools (validate_swiss, lookup_canton)
 * Step 3: Classification – Is this a contract?
 * Step 4: Agent 2 – LLM-as-a-Judge (reviews extraction, assigns confidence)
 * Step 5: Binary Mapping – confidence → ok / review_required
 * Step 6: Return result with full trace (observability)
 * 
 * Everything runs in the browser – no separate backend needed.
 */

import { ContractExtractionResult, DocumentClassification } from './types';
import {
  extractContractData,
  extractContractFromImages,
  mergeWithJudgeResult,
} from './openrouter';
import { readFileContent } from './pdf-extractor';
import { documentClassificationTool } from './tools';
import { runJudge } from './judge';
import {
  startTrace,
  addTraceStep,
  completeTraceStep,
  failTraceStep,
  completeTrace,
  failTrace,
  type PipelineTrace,
} from './trace';
import { RunTree } from 'langsmith/run_trees';
import {
  getLangSmithClient,
  isLangSmithEnabled,
  setPipelineLangSmithRoot,
} from './langsmith';

export interface PipelineResult {
  classification: DocumentClassification;
  extraction?: ContractExtractionResult;
  requiresReview: boolean;
  reviewFields: string[];
  trace: PipelineTrace;
  assistant_id?: string;
}

async function runDocumentPipelineImpl(
  file?: File,
  text?: string | null,
): Promise<PipelineResult> {
  const trace = startTrace();

  try {
    if (!file && !text) {
      throw new Error('No file or text to analyze.');
    }

    // ── Step 1: Document Extraction ──
    const step1 = addTraceStep('pdf_extraction', 'Dokument lesen', {
      fileName: file?.name,
      fileType: file?.type,
      hasText: !!text,
    });

    let documentText = text || '';
    let images: string[] | undefined;

    if (file && !documentText) {
      const fileContent = await readFileContent(file);
      documentText = fileContent.text;
      images = fileContent.images;
    }

    if (!documentText && !images?.length) {
      throw new Error(
        'Konnte keinen Text oder Bilder aus dem Dokument extrahieren.',
      );
    }

    completeTraceStep(step1, {
      textLength: documentText.length,
      imageCount: images?.length ?? 0,
      isScanned: !!images?.length,
    });

    // ── Step 1.5: Contract yes/no (Tool: document_classification) ──
    // Requirement: First determine whether it's a contract. If not, stop early.
    const step15 = addTraceStep('contract_gate', 'Ist das ein Vertrag? (Tool)', {
      mode: images?.length ? 'vision' : 'text',
    });
    const documentType =
      images?.length
        ? 'pdf_scanned'
        : file
          ? (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
              ? 'pdf_text'
              : file.type.startsWith('image/')
                ? 'image'
                : 'text_file')
          : 'text_file';
    const classificationRaw = await (documentClassificationTool as any).invoke({
      documentText,
      documentType,
    });
    let isRelevant = false;
    try {
      const parsed = JSON.parse(classificationRaw);
      isRelevant = parsed?.is_relevant === true;
    } catch {
      isRelevant = false;
    }
    completeTraceStep(step15, {
      is_relevant: isRelevant,
    });
    if (!isRelevant) {
      const finalTrace = completeTrace({
        fieldsExtracted: 0,
        fieldsMissing: 0,
        fieldsRequiringReview: 0,
        overallConfidence: 0,
        modelUsed: 'n/a',
        judgeModelUsed: 'n/a',
        toolsCalled: ['document_classification'],
      });
      return {
        classification: 'other',
        requiresReview: false,
        reviewFields: [],
        trace: finalTrace,
      };
    }

    // ── Step 2: Agent 1 – Extraction with Tools ──
    const step2 = addTraceStep('agent_extraction', 'Agent 1: Datenextraktion', {
      mode: images?.length ? 'vision' : 'text',
    });

    let rawResult;
    let toolCalls: string[] = [];

    if (images && images.length > 0) {
      const extracted = await extractContractFromImages(images);
      rawResult = extracted.raw;
      toolCalls = extracted.toolCalls;
    } else {
      const extracted = await extractContractData(documentText);
      rawResult = extracted.raw;
      toolCalls = extracted.toolCalls;
    }

    completeTraceStep(step2, {
      fieldsExtracted: rawResult.extraction_metadata.fields_extracted,
      fieldsMissing: rawResult.extraction_metadata.fields_missing,
      warnings: rawResult.extraction_metadata.warnings,
      toolsUsed: toolCalls,
    });

    // ── Step 3: Classification ──
    const step3 = addTraceStep('classification', 'Dokumentklassifikation');

    const hasContracts =
      rawResult.contracts &&
      (rawResult.contracts.employer ||
        rawResult.contracts.assistant ||
        rawResult.contracts.contract_terms);

    if (!hasContracts) {
      completeTraceStep(step3, { classification: 'other' });
      const finalTrace = completeTrace({
        fieldsExtracted: 0,
        fieldsMissing: 0,
        fieldsRequiringReview: 0,
        overallConfidence: 0,
        modelUsed: 'anthropic/claude-opus-4.6',
        judgeModelUsed: 'n/a',
        toolsCalled: toolCalls,
      });

      return {
        classification: 'other',
        requiresReview: false,
        reviewFields: [],
        trace: finalTrace,
      };
    }

    completeTraceStep(step3, { classification: 'contract' });

    // ── Step 4: Agent 2 – LLM-as-a-Judge ──
    const step4 = addTraceStep('agent_judge', 'Agent 2: Qualitätsprüfung (LLM-as-a-Judge)', {
      inputFields: Object.keys(rawResult.contracts),
    });

    const sourceText = images?.length
      ? '[Vision-basierte Extraktion aus gescanntem Dokument]'
      : documentText;

    const judgeResult = await runJudge(sourceText, rawResult.contracts);

    completeTraceStep(step4, {
      overallConfidence: judgeResult.overall_confidence,
      overallStatus: judgeResult.overall_status,
      reviewRequiredFields: judgeResult.review_required_fields,
      summary: judgeResult.summary,
    });

    // ── Step 5: Merge & Binary Mapping ──
    const step5 = addTraceStep('binary_mapping', 'Binäre Statuszuordnung');

    const finalExtraction = mergeWithJudgeResult(rawResult, judgeResult) as unknown as ContractExtractionResult;

    completeTraceStep(step5, {
      overallStatus: finalExtraction.extraction_metadata.overall_status,
      fieldsRequiringReview: finalExtraction.extraction_metadata.fields_requiring_review,
      reviewFields: finalExtraction.extraction_metadata.review_required_fields,
    });

    // ── Step 6: Complete ──
    const requiresReview =
      finalExtraction.extraction_metadata.overall_status === 'review_required';

    const finalTrace = completeTrace({
      fieldsExtracted: finalExtraction.extraction_metadata.fields_extracted,
      fieldsMissing: finalExtraction.extraction_metadata.fields_missing,
      fieldsRequiringReview: finalExtraction.extraction_metadata.fields_requiring_review ?? 0,
      overallConfidence: finalExtraction.extraction_metadata.overall_confidence,
      modelUsed: import.meta.env.VITE_OPENROUTER_EXTRACTOR_MODEL || import.meta.env.VITE_OPENROUTER_MODEL || 'anthropic/claude-opus-4.6',
      judgeModelUsed: import.meta.env.VITE_OPENROUTER_JUDGE_MODEL || import.meta.env.VITE_OPENROUTER_MODEL || 'anthropic/claude-opus-4.6',
      toolsCalled: toolCalls,
    });

    return {
      classification: 'contract',
      extraction: finalExtraction,
      requiresReview,
      reviewFields: finalExtraction.extraction_metadata.review_required_fields ?? [],
      trace: finalTrace,
    };
  } catch (error: any) {
    const errorTrace = failTrace(error?.message || 'Unknown error');
    throw Object.assign(error, { trace: errorTrace });
  }
}

/**
 * Öffentliche Pipeline: legt bei aktivem LangSmith einen Root-Run an, damit alle
 * Agent-/LLM-Spans in der UI unter einem Trace hängen (statt vieler Root-Zeilen).
 */
export async function runDocumentPipeline(
  file?: File,
  text?: string | null,
): Promise<PipelineResult> {
  const client = isLangSmithEnabled() ? getLangSmithClient() : null;
  let rootRun: RunTree | undefined;

  if (client) {
    const project =
      import.meta.env.VITE_LANGSMITH_PROJECT || 'asklepios-agent';
    rootRun = new RunTree({
      name: 'Asklepios: Dokument-Pipeline',
      client,
      project_name: project,
      run_type: 'chain',
      tracingEnabled: true,
      tags: ['asklepios', 'pipeline', 'idp'],
      inputs: {
        fileName: file?.name ?? null,
        hasText: !!text,
      },
    });
    await rootRun.postRun();
    setPipelineLangSmithRoot(rootRun);
  }

  try {
    const result = await runDocumentPipelineImpl(file, text);
    if (rootRun) {
      await rootRun.end({
        classification: result.classification,
        requiresReview: result.requiresReview,
        reviewFieldCount: result.reviewFields.length,
      });
      await rootRun.patchRun();
    }
    return result;
  } catch (e: unknown) {
    if (rootRun) {
      const msg = e instanceof Error ? e.message : String(e);
      await rootRun.end(undefined, msg);
      await rootRun.patchRun().catch(() => {});
    }
    throw e;
  } finally {
    setPipelineLangSmithRoot(null);
  }
}
