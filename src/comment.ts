import type { StatisticsReport } from "./config.js";

export const COMMENT_MARKER = "<!-- pr-diff-statistics -->";

export function renderStatisticsComment(report: StatisticsReport, headSha: string): string {
  const rows = [...report.groups, report.fallback].map(
    (statistics) =>
      `| ${escapeTableCell(statistics.label)} | ${escapeTableCell(statistics.suffixes)} | ${statistics.files} | ${statistics.additions} | ${statistics.deletions} | ${statistics.changes} |`,
  );

  return [
    COMMENT_MARKER,
    "## PR Diff Statistics",
    "",
    "| 分類 | 対象 suffix | ファイル | 追加 | 削除 | 編集 |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
    ...rows,
    "",
    `**合計:** ${report.total.files} files, ${report.total.additions} additions, ${report.total.deletions} deletions, ${report.total.changes} changes`,
    `対象 head commit: ${headSha.slice(0, 7)}`,
  ].join("\n");
}

export function renderUnavailableComment(headSha: string): string {
  return [
    COMMENT_MARKER,
    "## PR Diff Statistics",
    "",
    "GitHub APIの取得上限により集計不可",
    `対象 head commit: ${headSha.slice(0, 7)}`,
  ].join("\n");
}

export function escapeTableCell(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n?|\n/g, " ")
    .replace(/\|/g, "\\|")
    .replace(/`/g, "\\`");
}
