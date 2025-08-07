import { PDFDocument } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { mkdir, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

export interface PageJson {
  page: number;
  title: string;
  paragraphs: string[];
  chapter?: string;
  images?: { data: string; bbox: [number, number, number, number] }[];
}

export interface ProcessedPDF {
  metadata: {
    title?: string;
    author?: string;
    totalPages: number;
    createdAt: string;
    fileSizeMB: string;
  };
  pages: PageJson[];
}

/**
 * Core PDF ingestion function using pdfjs-dist for text extraction
 */
export async function ingestPdf(bytes: ArrayBuffer): Promise<PageJson[]> {
  const result: PageJson[] = [];

  // ------------ split ------------
  const pdfDoc = await PDFDocument.load(bytes);
  const pageCount = pdfDoc.getPageCount();

  // ------------ text extraction ------------
  const loader = await pdfjs.getDocument({ data: new Uint8Array(bytes) })
    .promise;

  let currentChapter = "";

  for (let i = 0; i < pageCount; i++) {
    const page = await loader.getPage(i + 1);
    const text = await page.getTextContent();
    const raw = (text.items as any[])
      .map((it) => it.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    // Enhanced segmentation with chapter detection
    const { title, paragraphs, chapter } = parsePageContent(
      raw,
      currentChapter
    );

    // Update current chapter if a new one is detected
    if (chapter) {
      currentChapter = chapter;
    }

    // images (optional—stub for future implementation)
    const images: PageJson["images"] = [];
    // ... add Poppler or pdfimages extraction later

    result.push({
      page: i + 1,
      title,
      paragraphs,
      chapter: currentChapter || undefined,
      images,
    });
  }
  return result;
}

/**
 * Parse page content to extract title, paragraphs, and detect chapters
 */
function parsePageContent(
  raw: string,
  currentChapter: string
): { title: string; paragraphs: string[]; chapter?: string } {
  if (!raw.trim()) {
    return { title: "", paragraphs: [], chapter: undefined };
  }

  // Detect chapter headings (common patterns)
  const chapterMatch = raw.match(
    /^(Chapter\s+\d+|CHAPTER\s+\d+|Part\s+\d+|PART\s+\d+|Section\s+\d+|SECTION\s+\d+)[:\s]*(.*?)(?:\.|$)/i
  );

  let detectedChapter: string | undefined;
  if (chapterMatch && chapterMatch[0]) {
    detectedChapter = chapterMatch[0].trim();
  }

  // Enhanced title extraction
  let title = "";
  let body = raw;

  // Look for title patterns
  const titlePatterns = [
    // First line if it's short and capitalized
    /^([A-Z][A-Za-z\s]{5,50})[\r\n]/,
    // Text before first period if reasonable length
    /^([^.]{10,80})\./,
    // Text in all caps (but not too long)
    /^([A-Z\s]{5,50})[\r\n]/,
    // Numbered sections
    /^(\d+\.?\s+[A-Za-z][^.]{5,50})/,
  ];

  for (const pattern of titlePatterns) {
    const match = raw.match(pattern);
    if (match && match[1]) {
      title = match[1].trim();
      body = raw.slice(match[0].length).trim();
      break;
    }
  }

  // If no title found, use first sentence
  if (!title) {
    const firstSentence = raw.match(/^([^.!?]{1,100}[.!?])/);
    if (firstSentence && firstSentence[1]) {
      title = firstSentence[1].trim();
      body = raw.slice(firstSentence[0].length).trim();
    }
  }

  // Split body into paragraphs
  const paragraphs = body
    .split(/\n\s*\n|\r\n\s*\r\n/) // Double line breaks
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);

  // If no paragraphs, treat the whole body as one paragraph
  if (paragraphs.length === 0 && body.trim()) {
    paragraphs.push(body.trim());
  }

  return {
    title: title || "Untitled",
    paragraphs,
    chapter: detectedChapter,
  };
}

/**
 * Convert processed PDF data to JSON format for storage
 */
export function toJSON(processedPDF: ProcessedPDF): string {
  return JSON.stringify(processedPDF, null, 2);
}

/**
 * Create chunks suitable for vector database storage
 */
export function createVectorChunks(processedPDF: ProcessedPDF): Array<{
  chunkId: string;
  content: string;
  metadata: {
    pageNumber: number;
    title?: string;
    chapter?: string;
    paragraphIndex?: number;
    source: string;
  };
}> {
  const chunks: Array<{
    chunkId: string;
    content: string;
    metadata: {
      pageNumber: number;
      title?: string;
      chapter?: string;
      paragraphIndex?: number;
      source: string;
    };
  }> = [];

  // optimize this
  processedPDF.pages.forEach((page) => {
    page.paragraphs.forEach((paragraph, paragraphIndex) => {
      if (paragraph.trim().length > 0) {
        chunks.push({
          chunkId: `${processedPDF.metadata.title || "document"}_page${page.page}_para${paragraphIndex}`,
          content: paragraph,
          metadata: {
            pageNumber: page.page,
            title: page.title,
            chapter: page.chapter,
            paragraphIndex,
            source: processedPDF.metadata.title || "Unknown Document",
          },
        });
      }
    });

    // Also create a chunk for the page title if it exists
    if (page.title && page.title !== "Untitled") {
      chunks.push({
        chunkId: `${processedPDF.metadata.title || "document"}_page${page.page}_title`,
        content: page.title,
        metadata: {
          pageNumber: page.page,
          title: page.title,
          chapter: page.chapter,
          source: processedPDF.metadata.title || "Unknown Document",
        },
      });
    }
  });

  return chunks;
}

/**
 * Extract and process a specific range of pages from a PDF
 */
export async function extractPageRange(
  pdfUri: string,
  startPage: number,
  endPage: number
): Promise<ProcessedPDF> {
  try {
    const pdfBytes = readFileSync(pdfUri);

    // Create new PDF with only the specified range
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const totalPages = pdfDoc.getPageCount();

    // Validate page range
    if (startPage < 1 || endPage > totalPages || startPage > endPage) {
      throw new Error(
        `Invalid page range: ${startPage}-${endPage}. PDF has ${totalPages} pages.`
      );
    }

    const newPdf = await PDFDocument.create();
    const pageIndices = Array.from(
      { length: endPage - startPage + 1 },
      (_, i) => startPage - 1 + i
    );

    const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
    copiedPages.forEach((page) => newPdf.addPage(page));

    const extractedBytes = await newPdf.save();

    // Store the correct file size before any potential reassignment
    const actualFileSize = extractedBytes.length;

    // Process the extracted pages
    const result = await ingestPdf(extractedBytes.buffer as ArrayBuffer);

    // Adjust page numbers to reflect original PDF
    const adjustedResult = result.map((page, index) => ({
      ...page,
      page: startPage + index,
    }));

    const metadata = {
      title: `${pdfDoc.getTitle() || "Untitled"} (Pages ${startPage}-${endPage})`,
      author: pdfDoc.getAuthor() || "Unknown",
      totalPages: endPage - startPage + 1,
      createdAt: new Date().toISOString(),
      fileSizeMB: (actualFileSize / (1024 * 1024)).toFixed(2),
    };

    const resultToReturn = {
      metadata,
      pages: adjustedResult,
    };

    return resultToReturn;
  } catch (error) {
    console.error("Error extracting page range:", error);
    throw error;
  }
}

/**
 * Save an extracted page range as a new PDF file
 */
export async function saveExtractedPdf(
  pdfUri: string,
  startPage: number,
  endPage: number,
  outPath: string
) {
  const pdfBytes = readFileSync(pdfUri);
  const src = await PDFDocument.load(pdfBytes);
  const dst = await PDFDocument.create();
  const indices = Array.from(
    { length: endPage - startPage + 1 },
    (_, i) => startPage - 1 + i
  );
  const pages = await dst.copyPages(src, indices);
  pages.forEach((p) => dst.addPage(p));
  const extractedBytes = await dst.save();
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, extractedBytes);
  return outPath;
}

/**
 * Split a PDF into single-page PDFs and save them into a directory
 */
export async function splitPdfToPages(pdfUri: string, outDir: string) {
  const pdfBytes = readFileSync(pdfUri);
  const src = await PDFDocument.load(pdfBytes);
  const total = src.getPageCount();
  mkdirSync(outDir, { recursive: true });
  const outputs: string[] = [];
  for (let i = 0; i < total; i++) {
    const dst = await PDFDocument.create();
    const [page] = await dst.copyPages(src, [i]);
    dst.addPage(page);
    const data = await dst.save();
    const outPath = join(outDir, `page_${i + 1}.pdf`);
    writeFileSync(outPath, data);
    outputs.push(outPath);
  }
  return { total, outputs };
}
