import type { StatisticsReport } from "./config.js";

export const COMMENT_MARKER = "<!-- pr-diff-statistics -->";
export const PR_BODY_START_MARKER = "<!-- pr-diff-statistics:start -->";
export const PR_BODY_END_MARKER = "<!-- pr-diff-statistics:end -->";

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

export function updatePullRequestBody(body: string, renderedComment: string): string {
  const startIndexes = markerIndexes(body, PR_BODY_START_MARKER);
  const endIndexes = markerIndexes(body, PR_BODY_END_MARKER);
  if (startIndexes.length === 0 && endIndexes.length === 0) {
    const separator = body.length === 0 ? "" : body.endsWith("\n") ? "\n" : "\n\n";
    return `${body}${separator}${bodySection(renderedComment)}`;
  }
  if (startIndexes.length !== 1 || endIndexes.length !== 1) {
    throw new Error("PR body must contain either no statistics markers or exactly one start/end marker pair");
  }
  const start = startIndexes[0]!;
  const end = endIndexes[0]!;
  if (start > end) {
    throw new Error("PR body statistics start marker must appear before the end marker");
  }
  return `${body.slice(0, start)}${bodySection(renderedComment)}${body.slice(end + PR_BODY_END_MARKER.length)}`;
}

function bodySection(renderedComment: string): string {
  const content = renderedComment.startsWith(`${COMMENT_MARKER}\n`)
    ? renderedComment.slice(COMMENT_MARKER.length + 1)
    : renderedComment;
  return `${PR_BODY_START_MARKER}\n${content}\n${PR_BODY_END_MARKER}`;
}

function markerIndexes(body: string, marker: string): number[] {
  const indexes: number[] = [];
  let offset = 0;
  while ((offset = body.indexOf(marker, offset)) !== -1) {
    indexes.push(offset);
    offset += marker.length;
  }
  return indexes;
}

export function escapeTableCell(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n?|\n/g, " ")
    .replace(/\|/g, "\\|")
    .replace(/`/g, "\\`");
}
