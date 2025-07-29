import { PDFDocument } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { mkdir, readFileSync, writeFileSync, statSync } from "fs";

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
 * Main function to process a PDF file and extract structured content
 */
export async function processPDF(pdfUri: string): Promise<ProcessedPDF> {
  try {
    // Read the PDF file
    const pdfBytes = readFileSync(pdfUri);

    const result = await ingestPdf(pdfBytes.buffer as ArrayBuffer);

    // Extract metadata using pdf-lib
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const metadata = {
      title: pdfDoc.getTitle() || "Untitled",
      author: pdfDoc.getAuthor() || "Unknown",
      totalPages: pdfDoc.getPageCount(),
      createdAt: new Date().toISOString(),
      fileSizeMB: (pdfBytes.length / (1024 * 1024)).toFixed(2),
    };

    return {
      metadata,
      pages: result,
    };
  } catch (error) {
    console.error("Error processing PDF:", error);
    throw new Error(
      `Failed to process PDF: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
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
 * Split PDF into individual page files
 */
export async function splitPDFIntoPages(
  pdfUri: string,
  outputDir: string
): Promise<string[]> {
  try {
    const pdfBytes = readFileSync(pdfUri);

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pageCount = pdfDoc.getPageCount();
    const pageFiles: string[] = [];

    // Ensure output directory exists
    mkdir(outputDir, { recursive: true }, (err) => {
      if (err) {
        console.error("Error creating output directory:", err);
        throw new Error(`Failed to create output directory: ${err.message}`);
      }
    });

    for (let i = 0; i < pageCount; i++) {
      // Create a new PDF document with just this page
      const newPdf = await PDFDocument.create();
      const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
      newPdf.addPage(copiedPage);

      // Save the single page PDF
      const pdfBytesArray = await newPdf.save();
      const base64String = Buffer.from(pdfBytesArray).toString("base64");

      const pageFileName = `page_${i + 1}.pdf`;
      const pageFilePath = `${outputDir}/${pageFileName}`;

      writeFileSync(pageFilePath, base64String);

      pageFiles.push(pageFilePath);
    }

    return pageFiles;
  } catch (error) {
    console.error("Error splitting PDF:", error);
    throw new Error(
      `Failed to split PDF: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
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
