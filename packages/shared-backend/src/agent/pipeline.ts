import { ContractExtractionResult, DocumentClassification } from './types';
import { extractContractData, extractContractFromImages } from './openrouter';
import { readFileContent } from './pdf-extractor';

/**
 * IDP Pipeline – runs entirely in the browser.
 * 
 * 1. Extracts text (and images for scanned docs) from the uploaded file via pdf.js
 * 2. Sends text/images to OpenRouter API directly from the browser
 * 3. Returns structured extraction result
 * 
 * No separate Python backend needed – everything runs on localhost:5173.
 */

export async function runDocumentPipeline(file?: File, text?: string | null): Promise<{
  classification: DocumentClassification;
  extraction?: ContractExtractionResult;
  requiresReview: boolean;
  assistant_id?: string;
}> {
  if (!file && !text) {
    throw new Error('No file or text to analyze.');
  }

  // Step 1: Get text content (and images for scanned PDFs)
  let documentText = text || '';
  let images: string[] | undefined;

  if (file && !documentText) {
    const fileContent = await readFileContent(file);
    documentText = fileContent.text;
    images = fileContent.images;
  }

  if (!documentText && !images?.length) {
    throw new Error('Konnte keinen Text oder Bilder aus dem Dokument extrahieren.');
  }

  // Step 2: Call OpenRouter directly from browser
  let result;

  if (images && images.length > 0) {
    // Scanned PDF or image upload → use vision model
    result = await extractContractFromImages(images);
  } else {
    // Text-based PDF → use text extraction
    result = await extractContractData(documentText);
  }

  // Step 3: Determine classification
  const hasContracts = result.contracts &&
    (result.contracts.employer || result.contracts.assistant || result.contracts.contract_terms);

  if (!hasContracts) {
    return {
      classification: 'other',
      requiresReview: false,
    };
  }

  // Step 4: Check confidence for review
  const meta = result.extraction_metadata;
  const overallConfidence = meta?.overall_confidence ?? 0;
  const ahvValue = result.contracts?.assistant?.ahv_number?.value;
  const firstNameValue = result.contracts?.assistant?.first_name?.value;

  const requiresReview =
    overallConfidence < 0.85 ||
    ahvValue === null ||
    ahvValue === undefined ||
    firstNameValue === null ||
    firstNameValue === undefined;

  const extraction: ContractExtractionResult = {
    contracts: result.contracts as any,
    extraction_metadata: {
      document_language: meta?.document_language ?? 'de',
      overall_confidence: overallConfidence,
      fields_extracted: meta?.fields_extracted ?? 0,
      fields_missing: meta?.fields_missing ?? 0,
      warnings: meta?.warnings ?? [],
    },
  };

  return {
    classification: 'contract',
    extraction,
    requiresReview,
  };
}
