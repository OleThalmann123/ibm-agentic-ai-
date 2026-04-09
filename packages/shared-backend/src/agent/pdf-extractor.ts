/**
 * PDF Text Extraction using Mozilla pdf.js
 * 
 * Extracts text content from PDF files in the browser.
 * For scanned PDFs (image-only), falls back to rendering pages as images
 * for vision model processing.
 */

import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// Configure the worker - use the bundled worker from pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

export interface PdfExtractionResult {
  text: string;
  pageCount: number;
  /** If text extraction yielded very little text, pages are rendered as images */
  pageImages?: string[];
  isScanned: boolean;
}

/**
 * Extract PDF content by rendering every page as an image for the vision model.
 * Text-only extraction loses document layout (columns, sections, headers) which
 * causes the LLM to confuse employer/employee data. Vision preserves the layout.
 */
export async function extractPdfContent(file: File): Promise<PdfExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pageCount = pdf.numPages;
  const pageImages: string[] = [];

  for (let i = 1; i <= Math.min(pageCount, 10); i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    pageImages.push(canvas.toDataURL('image/jpeg', 0.85));
    canvas.remove();
  }

  return { text: '', pageCount, pageImages, isScanned: true };
}

/**
 * Read any supported file type and return text content.
 * Handles: PDF, TXT, DOCX (text extraction), images (as base64 for vision).
 */
export async function readFileContent(file: File): Promise<{ text: string; images?: string[] }> {
  const type = file.type;
  const name = file.name.toLowerCase();

  // PDF → immer als Seitenbilder für Vision-Modell (Layout bleibt erhalten)
  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    const result = await extractPdfContent(file);
    return { text: '[PDF: Vision-Analyse]', images: result.pageImages ?? [] };
  }

  // Images → base64 for vision model
  if (type.startsWith('image/')) {
    const base64 = await fileToBase64(file);
    return { text: '[Bild-Upload: Vision-Analyse]', images: [base64] };
  }

  // DOCX: extract text from zipped XML container
  if (
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    const arrayBuffer = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer });
    const text = (value ?? '').replace(/\s+/g, ' ').trim();
    return { text };
  }

  // Legacy DOC (binary) is not reliably parseable in-browser without extra tooling.
  if (type === 'application/msword' || name.endsWith('.doc')) {
    throw new Error('Das DOC-Format (.doc) wird nicht unterstützt. Bitte als PDF oder DOCX hochladen.');
  }

  // Text-based files (txt, etc.)
  const text = await file.text();
  return { text };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
    reader.readAsDataURL(file);
  });
}
