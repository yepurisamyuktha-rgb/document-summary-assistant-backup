export type SummaryLength = "short" | "medium" | "long";

export interface SummaryResult {
  title: string;
  summary: string;
  keyPoints: string[];
  improvementSuggestions: string[];
}
