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
 * Extract text from a PDF file.
 * If the PDF is scanned (image-only), renders pages as base64 images.
 */
export async function extractPdfContent(file: File): Promise<PdfExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  const pageCount = pdf.numPages;
  const textParts: string[] = [];

  // Extract text from each page
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (pageText) {
      textParts.push(`--- Seite ${i} ---\n${pageText}`);
    }
  }

  const fullText = textParts.join('\n\n');
  
  // Check if PDF is scanned (very little text extracted)
  const isScanned = fullText.length < 50;

  if (isScanned) {
    // Render pages as images for vision model fallback
    const pageImages: string[] = [];
    
    for (let i = 1; i <= Math.min(pageCount, 10); i++) { // Max 10 pages
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 }); // 2x for quality
      
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      
      await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
      pageImages.push(canvas.toDataURL('image/jpeg', 0.85));
      canvas.remove();
    }

    return { text: fullText, pageCount, pageImages, isScanned };
  }

  return { text: fullText, pageCount, isScanned };
}

/**
 * Read any supported file type and return text content.
 * Handles: PDF, TXT, DOCX (text extraction), images (as base64 for vision).
 */
export async function readFileContent(file: File): Promise<{ text: string; images?: string[] }> {
  const type = file.type;
  const name = file.name.toLowerCase();

  // PDF
  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    const result = await extractPdfContent(file);
    if (result.isScanned && result.pageImages) {
      return { text: result.text || '[Gescanntes PDF: Vision-Analyse]', images: result.pageImages };
    }
    return { text: result.text };
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
