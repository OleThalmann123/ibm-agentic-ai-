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

/**
 * Read a File as ArrayBuffer with robust fallback.
 *
 * The browser File API can throw `DOMException: NotReadableError` ("The requested
 * file could not be read, typically due to permission problems that have occurred
 * after a reference to a file was acquired") when the OS cannot read the underlying
 * file. Common causes: iCloud / OneDrive / Dropbox placeholders that were not yet
 * downloaded locally, files moved or deleted between picking and reading, or
 * sandbox permission changes.
 *
 * We try `Blob.arrayBuffer()` first, fall back to FileReader (which sometimes
 * succeeds where the streaming API fails), and rethrow a German-language error
 * with actionable guidance if both fail.
 */
export async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  const friendlyMessage = `Die Datei „${file.name}“ konnte nicht gelesen werden. Mögliche Ursachen: Die Datei liegt in iCloud/OneDrive/Dropbox und ist nicht lokal verfügbar, sie wurde nach der Auswahl verschoben oder gelöscht, oder der Browser hat keinen Zugriff mehr. Bitte stellen Sie sicher, dass die Datei lokal verfügbar ist (ggf. herunterladen) und wählen Sie sie erneut aus.`;

  const isNotReadableError = (err: unknown): boolean => {
    if (err instanceof DOMException) {
      return (
        err.name === 'NotReadableError' ||
        err.name === 'NotFoundError' ||
        err.name === 'SecurityError'
      );
    }
    const msg = err instanceof Error ? err.message : String(err ?? '');
    return /could not be read|permission problems|not.{0,5}readable|notreadable/i.test(msg);
  };

  try {
    return await file.arrayBuffer();
  } catch (primaryErr) {
    if (!isNotReadableError(primaryErr)) {
      throw primaryErr;
    }
    try {
      return await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          if (result instanceof ArrayBuffer) resolve(result);
          else reject(new Error(friendlyMessage));
        };
        reader.onerror = () => reject(reader.error ?? new Error(friendlyMessage));
        reader.readAsArrayBuffer(file);
      });
    } catch {
      throw new Error(friendlyMessage);
    }
  }
}

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
  const arrayBuffer = await readFileAsArrayBuffer(file);
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
 * Render plain text onto a canvas and return a base64 JPEG image.
 * Used so that DOCX/TXT also go through the vision pipeline.
 */
function renderTextToImage(text: string): string[] {
  const LINE_HEIGHT = 22;
  const PADDING = 40;
  const MAX_WIDTH = 800;
  const FONT = '14px "Courier New", monospace';
  const MAX_LINES_PER_PAGE = 60;

  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = FONT;

  const wrappedLines: string[] = [];
  for (const raw of text.split('\n')) {
    if (!raw.trim()) { wrappedLines.push(''); continue; }
    let line = '';
    for (const word of raw.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (measure.measureText(test).width > MAX_WIDTH - PADDING * 2) {
        if (line) wrappedLines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) wrappedLines.push(line);
  }

  const pages: string[] = [];
  for (let i = 0; i < wrappedLines.length; i += MAX_LINES_PER_PAGE) {
    const chunk = wrappedLines.slice(i, i + MAX_LINES_PER_PAGE);
    const height = PADDING * 2 + chunk.length * LINE_HEIGHT;

    const canvas = document.createElement('canvas');
    canvas.width = MAX_WIDTH;
    canvas.height = Math.max(height, 200);
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111111';
    ctx.font = FONT;

    chunk.forEach((ln, idx) => {
      ctx.fillText(ln, PADDING, PADDING + idx * LINE_HEIGHT);
    });

    pages.push(canvas.toDataURL('image/jpeg', 0.90));
    canvas.remove();
  }

  return pages;
}

/**
 * Read any supported file type and always return images for the vision model.
 * Every format gets converted to page images — uniform pipeline, no text path.
 */
export async function readFileContent(file: File): Promise<{ text: string; images?: string[] }> {
  const type = file.type;
  const name = file.name.toLowerCase();

  // PDF → Seiten als Bilder rendern
  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    const result = await extractPdfContent(file);
    return { text: '[PDF: Vision-Analyse]', images: result.pageImages ?? [] };
  }

  // Bilder → direkt durchreichen
  if (type.startsWith('image/')) {
    const base64 = await fileToBase64(file);
    return { text: '[Bild: Vision-Analyse]', images: [base64] };
  }

  // DOCX → Text extrahieren, dann als Bild rendern
  if (
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const { value } = await mammoth.extractRawText({ arrayBuffer });
    const text = (value ?? '').trim();
    if (!text) throw new Error('DOCX-Datei enthält keinen Text.');
    return { text: '[DOCX: Vision-Analyse]', images: renderTextToImage(text) };
  }

  // Legacy DOC — nicht zuverlässig im Browser parsebar
  if (type === 'application/msword' || name.endsWith('.doc')) {
    throw new Error('Das DOC-Format (.doc) wird nicht unterstützt. Bitte als PDF oder DOCX hochladen.');
  }

  // TXT und andere Textformate → als Bild rendern
  const text = await file.text();
  if (!text.trim()) throw new Error('Datei ist leer.');
  return { text: '[Text: Vision-Analyse]', images: renderTextToImage(text) };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(
        new Error(
          `Die Datei „${file.name}“ konnte nicht gelesen werden. Mögliche Ursachen: Die Datei liegt in iCloud/OneDrive/Dropbox und ist nicht lokal verfügbar, sie wurde nach der Auswahl verschoben oder gelöscht, oder der Browser hat keinen Zugriff mehr. Bitte stellen Sie sicher, dass die Datei lokal verfügbar ist (ggf. herunterladen) und wählen Sie sie erneut aus.`,
        ),
      );
    reader.readAsDataURL(file);
  });
}
