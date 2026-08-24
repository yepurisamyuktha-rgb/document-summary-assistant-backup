import type { PDFPageProxy } from "pdfjs-dist";
import type { Worker } from "tesseract.js";

export const MAX_FILE_SIZE = 15 * 1024 * 1024;
export const MAX_PDF_PAGES = 30;
export const MAX_TEXT_CHARACTERS = 120_000;

const MIN_NATIVE_TEXT_PER_PAGE = 40;
const SUPPORTED_IMAGE_EXTENSIONS = /\.(png|jpe?g|webp)$/i;

export type ExtractionProgress = (
  progress: number,
  message: string
) => void;

export interface ExtractedDocument {
  text: string;
  pageCount: number;
  usedOcr: boolean;
}

function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

function isSupportedImage(file: File): boolean {
  return (
    ["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    SUPPORTED_IMAGE_EXTENSIONS.test(file.name)
  );
}

function validateFile(file: File): void {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("The file is larger than the 15 MB limit.");
  }

  if (!isPdf(file) && !isSupportedImage(file)) {
    throw new Error("Upload a PDF, PNG, JPEG, or WebP file.");
  }
}

function cleanExtractedText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

async function createOcrWorker(
  onProgress: ExtractionProgress,
  progressMapper: (ocrProgress: number) => number
): Promise<Worker> {
  const { createWorker } = await import("tesseract.js");

  return createWorker("eng", undefined, {
    logger: (message) => {
      if (
        message.status === "recognizing text" &&
        typeof message.progress === "number"
      ) {
        onProgress(
          Math.round(progressMapper(message.progress)),
          "Reading scanned text with OCR..."
        );
      }
    },
  });
}

async function extractImage(
  file: File,
  onProgress: ExtractionProgress
): Promise<ExtractedDocument> {
  onProgress(5, "Starting OCR engine...");

  const worker = await createOcrWorker(
    onProgress,
    (ocrProgress) => 10 + ocrProgress * 85
  );

  try {
    const result = await worker.recognize(file);
    const text = cleanExtractedText(result.data.text);

    if (text.length < 20) {
      throw new Error(
        "Very little text was found. Try a clearer or higher-resolution image."
      );
    }

    onProgress(100, "Text extraction complete.");

    return {
      text,
      pageCount: 1,
      usedOcr: true,
    };
  } finally {
    await worker.terminate();
  }
}

async function renderPageToCanvas(
  page: PDFPageProxy
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale: 2 });

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });

  if (!context) {
    throw new Error("Your browser could not create a canvas for OCR.");
  }

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  await page.render({
    canvas,
    canvasContext: context,
    viewport,
  }).promise;

  return canvas;
}

async function extractPdf(
  file: File,
  onProgress: ExtractionProgress
): Promise<ExtractedDocument> {
  onProgress(2, "Loading PDF...");

  const pdfjs = await import("pdfjs-dist");

  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;

  const pageCount = pdf.numPages;

  if (pageCount > MAX_PDF_PAGES) {
    await loadingTask.destroy();

    throw new Error(
      `This PDF has ${pageCount} pages. The current limit is ${MAX_PDF_PAGES}.`
    );
  }

  const pages: string[] = [];
  let worker: Worker | null = null;
  let usedOcr = false;

  try {
    for (
      let pageNumber = 1;
      pageNumber <= pageCount;
      pageNumber += 1
    ) {
      const page = await pdf.getPage(pageNumber);

      const pageStart = ((pageNumber - 1) / pageCount) * 100;
      const pageEnd = (pageNumber / pageCount) * 100;

      onProgress(
        Math.round(pageStart),
        `Reading page ${pageNumber} of ${pageCount}...`
      );

      const textContent = await page.getTextContent();

      const nativeText = cleanExtractedText(
        textContent.items
          .map((item) => {
            if (!("str" in item)) {
              return "";
            }

            return `${item.str}${item.hasEOL ? "\n" : " "}`;
          })
          .join("")
      );

      let pageText = nativeText;

      if (nativeText.length < MIN_NATIVE_TEXT_PER_PAGE) {
        usedOcr = true;

        if (!worker) {
          worker = await createOcrWorker(
            onProgress,
            (ocrProgress) =>
              pageStart + ocrProgress * (pageEnd - pageStart)
          );
        }

        const canvas = await renderPageToCanvas(page);

        try {
          const result = await worker.recognize(canvas);
          pageText = cleanExtractedText(result.data.text);
        } finally {
          canvas.width = 1;
          canvas.height = 1;
        }
      }

      if (pageText) {
        pages.push(`--- Page ${pageNumber} ---\n${pageText}`);
      }

      page.cleanup();

      onProgress(
        Math.round(pageEnd),
        `Completed page ${pageNumber} of ${pageCount}.`
      );
    }
  } finally {
    if (worker) {
      await worker.terminate();
    }

    await loadingTask.destroy();
  }

  const text = cleanExtractedText(pages.join("\n\n"));

  if (text.length < 20) {
    throw new Error(
      "No readable text was found. Try a clearer scan or a different document."
    );
  }

  onProgress(100, "Text extraction complete.");

  return {
    text,
    pageCount,
    usedOcr,
  };
}

export async function extractDocument(
  file: File,
  onProgress: ExtractionProgress
): Promise<ExtractedDocument> {
  validateFile(file);

  const extracted = isPdf(file)
    ? await extractPdf(file, onProgress)
    : await extractImage(file, onProgress);

  if (extracted.text.length > MAX_TEXT_CHARACTERS) {
    throw new Error(
      "The extracted document is too long for this version of the app. Use a shorter document or split it into parts."
    );
  }

  return extracted;
}