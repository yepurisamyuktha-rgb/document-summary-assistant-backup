"use client";

import {
  CheckCircle2,
  Copy,
  Download,
  FileText,
  Lightbulb,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";

import {
  extractDocument,
  MAX_FILE_SIZE,
} from "@/lib/extract-document";

import type {
  SummaryLength,
  SummaryResult,
} from "@/types/summary";

type AppStatus =
  | "idle"
  | "extracting"
  | "summarizing"
  | "complete";

const summaryLengths: Array<{
  value: SummaryLength;
  label: string;
  description: string;
}> = [
  {
    value: "short",
    label: "Short",
    description: "Quick overview",
  },
  {
    value: "medium",
    label: "Medium",
    description: "Balanced detail",
  },
  {
    value: "long",
    label: "Long",
    description: "Thorough summary",
  },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.ceil(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [length, setLength] =
    useState<SummaryLength>("medium");

  const [status, setStatus] =
    useState<AppStatus>("idle");

  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] =
    useState("");

  const [error, setError] = useState("");
  const [result, setResult] =
    useState<SummaryResult | null>(null);

  const [copied, setCopied] = useState(false);

  const isBusy =
    status === "extracting" ||
    status === "summarizing";

  const resetOutput = () => {
    setError("");
    setResult(null);
    setProgress(0);
    setStatus("idle");
    setStatusMessage("");
    setCopied(false);
  };

  const onDrop = (
    acceptedFiles: File[],
    rejectedFiles: FileRejection[]
  ) => {
    resetOutput();

    if (rejectedFiles.length > 0) {
      setFile(null);

      setError(
        rejectedFiles[0].errors[0]?.message ??
          "Upload a valid PDF or image smaller than 15 MB."
      );

      return;
    }

    setFile(acceptedFiles[0] ?? null);
  };

  const {
    getRootProps,
    getInputProps,
    isDragActive,
  } = useDropzone({
    onDrop,
    multiple: false,
    maxFiles: 1,
    maxSize: MAX_FILE_SIZE,
    disabled: isBusy,

    accept: {
      "application/pdf": [".pdf"],
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/webp": [".webp"],
    },
  });

  const generateSummary = async () => {
    if (!file || isBusy) {
      return;
    }

    resetOutput();

    setStatus("extracting");
    setStatusMessage("Preparing document...");

    try {
      const extracted = await extractDocument(
        file,
        (nextProgress, message) => {
          setProgress(nextProgress);
          setStatusMessage(message);
        }
      );

      setStatus("summarizing");
      setProgress(100);

      setStatusMessage(
        `Generating ${length} summary from ${
          extracted.pageCount
        } page${
          extracted.pageCount === 1 ? "" : "s"
        }${
          extracted.usedOcr
            ? " using OCR"
            : ""
        }...`
      );

      const response = await fetch(
        "/api/summarize",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            text: extracted.text,
            length,
          }),
        }
      );

      const payload: {
        data?: SummaryResult;
        error?: string;
      } = await response.json();

      if (!response.ok || !payload.data) {
        throw new Error(
          payload.error ??
            "The summary could not be generated."
        );
      }

      setResult(payload.data);
      setStatus("complete");
      setStatusMessage("Summary complete.");
    } catch (caughtError) {
      setStatus("idle");
      setProgress(0);
      setStatusMessage("");

      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong. Please try again."
      );
    }
  };

  const clearDocument = () => {
    setFile(null);
    resetOutput();
  };

  const copySummary = async () => {
    if (!result) {
      return;
    }

    const text = [
      result.title,
      "",
      result.summary,
      "",
      "Key points",
      ...result.keyPoints.map(
        (point) => `- ${point}`
      ),
      "",
      "Improvement suggestions",
      ...(result.improvementSuggestions.length >
      0
        ? result.improvementSuggestions.map(
            (suggestion) => `- ${suggestion}`
          )
        : [
            "- No specific improvements suggested.",
          ]),
    ].join("\n");

    await navigator.clipboard.writeText(text);

    setCopied(true);

    window.setTimeout(
      () => setCopied(false),
      2000
    );
  };

  const downloadSummary = () => {
    if (!result) {
      return;
    }

    const text = [
      result.title,
      "",
      result.summary,
      "",
      "KEY POINTS",
      ...result.keyPoints.map(
        (point) => `- ${point}`
      ),
      "",
      "IMPROVEMENT SUGGESTIONS",
      ...(result.improvementSuggestions.length >
      0
        ? result.improvementSuggestions.map(
            (suggestion) => `- ${suggestion}`
          )
        : [
            "- No specific improvements suggested.",
          ]),
    ].join("\n");

    const blob = new Blob([text], {
      type: "text/plain;charset=utf-8",
    });

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;
    link.download =
      "document-summary.txt";

    link.click();

    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">

        <header className="mx-auto mb-10 max-w-3xl text-center">

          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-200">
            <Sparkles
              aria-hidden="true"
              className="h-4 w-4"
            />

            AI document insights
          </div>

          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Turn documents into useful summaries
          </h1>

          <p className="mt-4 text-pretty text-base leading-7 text-slate-400 sm:text-lg">
            Upload a PDF or image. We extract its
            text, identify the main ideas, and produce
            a summary you can use immediately.
          </p>

        </header>

        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">

          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20 sm:p-7">

            <div className="mb-5">
              <h2 className="text-xl font-semibold">
                Upload document
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                PDF, PNG, JPEG, or WebP. Maximum 15 MB.
              </p>
            </div>

            <div
              {...getRootProps()}
              className={`flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-8 text-center transition ${
                isDragActive
                  ? "border-cyan-300 bg-cyan-400/10"
                  : "border-slate-700 bg-slate-950/50 hover:border-cyan-400/60 hover:bg-slate-900"
              } ${
                isBusy
                  ? "cursor-not-allowed opacity-60"
                  : ""
              }`}
            >

              <input
                {...getInputProps()}
                aria-label="Upload document"
              />

              <div className="mb-4 rounded-2xl bg-cyan-400/10 p-4 text-cyan-300">
                <UploadCloud
                  aria-hidden="true"
                  className="h-8 w-8"
                />
              </div>

              <p className="font-medium">
                {isDragActive
                  ? "Drop the document here"
                  : "Drag and drop your document"}
              </p>

              <p className="mt-2 text-sm text-slate-500">
                or click to choose a file
              </p>

            </div>

            {file && (
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4">

                <FileText
                  aria-hidden="true"
                  className="h-6 w-6 shrink-0 text-cyan-300"
                />

                <div className="min-w-0 flex-1">

                  <p className="truncate text-sm font-medium">
                    {file.name}
                  </p>

                  <p className="text-xs text-slate-500">
                    {formatFileSize(file.size)}
                  </p>

                </div>

                <button
                  type="button"
                  onClick={clearDocument}
                  disabled={isBusy}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed"
                  aria-label="Remove document"
                >
                  <RotateCcw
                    aria-hidden="true"
                    className="h-4 w-4"
                  />
                </button>

              </div>
            )}

            <fieldset className="mt-6">

              <legend className="mb-3 text-sm font-medium text-slate-300">
                Summary length
              </legend>

              <div className="grid grid-cols-3 gap-2">

                {summaryLengths.map(
                  (option) => (
                    <button
                      key={option.value}
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        setLength(option.value)
                      }
                      aria-pressed={
                        length === option.value
                      }
                      className={`rounded-xl border px-3 py-3 text-left transition disabled:cursor-not-allowed ${
                        length === option.value
                          ? "border-cyan-400 bg-cyan-400/10 text-white"
                          : "border-white/10 bg-slate-950/40 text-slate-400 hover:border-white/20"
                      }`}
                    >

                      <span className="block text-sm font-medium">
                        {option.label}
                      </span>

                      <span className="mt-1 hidden text-xs text-slate-500 sm:block">
                        {option.description}
                      </span>

                    </button>
                  )
                )}

              </div>

            </fieldset>

            <button
              type="button"
              onClick={generateSummary}
              disabled={!file || isBusy}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >

              {isBusy ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="h-5 w-5 animate-spin"
                />
              ) : (
                <Sparkles
                  aria-hidden="true"
                  className="h-5 w-5"
                />
              )}

              {isBusy
                ? "Working..."
                : "Generate summary"}

            </button>

            {isBusy && (
              <div
                className="mt-5"
                role="status"
                aria-live="polite"
              >

                <div className="mb-2 flex justify-between gap-4 text-xs text-slate-400">

                  <span>
                    {statusMessage}
                  </span>

                  <span>
                    {status === "summarizing"
                      ? "AI"
                      : `${progress}%`}
                  </span>

                </div>

                <div className="h-2 overflow-hidden rounded-full bg-slate-800">

                  <div
                    className={`h-full rounded-full bg-cyan-400 transition-all ${
                      status === "summarizing"
                        ? "w-full animate-pulse"
                        : ""
                    }`}
                    style={
                      status === "extracting"
                        ? {
                            width: `${progress}%`,
                          }
                        : undefined
                    }
                  />

                </div>

              </div>
            )}

            {error && (
              <div
                className="mt-5 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200"
                role="alert"
              >
                {error}
              </div>
            )}

          </div>

          <div className="min-h-[34rem] rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20 sm:p-7">

            {!result ? (
              <div className="flex h-full min-h-[30rem] flex-col items-center justify-center text-center">

                <div className="mb-4 rounded-2xl bg-violet-400/10 p-4 text-violet-300">
                  <FileText
                    aria-hidden="true"
                    className="h-8 w-8"
                  />
                </div>

                <h2 className="text-xl font-semibold">
                  Your summary appears here
                </h2>

                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                  Choose a document and summary length,
                  then generate a clear overview with key
                  points and improvement suggestions.
                </p>

              </div>
            ) : (
              <article>

                <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">

                  <div>

                    <div className="mb-2 flex items-center gap-2 text-sm text-emerald-300">

                      <CheckCircle2
                        aria-hidden="true"
                        className="h-4 w-4"
                      />

                      Summary ready

                    </div>

                    <h2 className="text-2xl font-semibold">
                      {result.title}
                    </h2>

                  </div>

                  <div className="flex gap-2">

                    <button
                      type="button"
                      onClick={copySummary}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
                    >

                      <Copy
                        aria-hidden="true"
                        className="h-4 w-4"
                      />

                      {copied
                        ? "Copied"
                        : "Copy"}

                    </button>

                    <button
                      type="button"
                      onClick={downloadSummary}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
                    >

                      <Download
                        aria-hidden="true"
                        className="h-4 w-4"
                      />

                      Download

                    </button>

                  </div>

                </div>

                <section className="py-6">

                  <h3 className="text-sm font-semibold uppercase tracking-wider text-cyan-300">
                    Summary
                  </h3>

                  <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-300 sm:text-base">
                    {result.summary}
                  </p>

                </section>

                <section className="border-t border-white/10 py-6">

                  <h3 className="text-sm font-semibold uppercase tracking-wider text-cyan-300">
                    Key points
                  </h3>

                  <ul className="mt-4 space-y-3">

                    {result.keyPoints.map(
                      (point, index) => (
                        <li
                          key={`${point}-${index}`}
                          className="flex gap-3 text-sm leading-6 text-slate-300"
                        >

                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />

                          {point}

                        </li>
                      )
                    )}

                  </ul>

                </section>

                <section className="border-t border-white/10 pt-6">

                  <div className="flex items-center gap-2">

                    <Lightbulb
                      aria-hidden="true"
                      className="h-4 w-4 text-amber-300"
                    />

                    <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-300">
                      Improvement suggestions
                    </h3>

                  </div>

                  {result.improvementSuggestions.length >
                  0 ? (
                    <ul className="mt-4 space-y-3">

                      {result.improvementSuggestions.map(
                        (suggestion, index) => (
                          <li
                            key={`${suggestion}-${index}`}
                            className="rounded-xl bg-amber-300/5 p-4 text-sm leading-6 text-slate-300"
                          >
                            {suggestion}
                          </li>
                        )
                      )}

                    </ul>
                  ) : (
                    <p className="mt-4 text-sm text-slate-500">
                      No specific improvements were
                      suggested.
                    </p>
                  )}

                </section>

              </article>
            )}

          </div>

        </section>

        <footer className="mt-8 text-center text-xs leading-5 text-slate-600">
          Review AI-generated summaries against the
          original document before relying on them for
          legal, medical, financial, or other important
          decisions.
        </footer>

      </div>
    </main>
  );
}