// Shared metadata for semester-project write-ups and their report files.

/** Shown on every semester-project page. */
export const REPORT_NOTICE =
  "Final report as submitted for coursework. Suggestions raised during the " +
  "external evaluation have not been addressed — the report and the code " +
  "reflect the submitted version.";

export const STATUS_LABEL: Record<string, string> = {
  coursework: "final coursework project",
  maintained: "maintained occasionally",
  archived: "not maintained",
};

/** Human label per report role, in display order. */
export const REPORT_ROLE_ORDER = [
  "report",
  "source",
  "proposal",
  "presentation",
  "guideline",
] as const;

export const REPORT_ROLE_LABEL: Record<string, string> = {
  report: "Report",
  source: "Source file",
  proposal: "Proposal",
  presentation: "Presentation",
  guideline: "Course guideline",
};
