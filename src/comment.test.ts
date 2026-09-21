import { describe, expect, it } from "vitest";

import { escapeTableCell, renderStatisticsComment } from "./comment.js";

describe("escapeTableCell", () => {
  it("escapes table and code formatting characters", () => {
    expect(escapeTableCell("line one\r\nline|two`\\")).toBe("line one line\\|two\\`\\\\");
  });
});

describe("renderStatisticsComment", () => {
  it("renders grouped statistics, totals, and the short head SHA", () => {
    const comment = renderStatisticsComment(
        {
          groups: [
            {
              label: "Runtime",
              suffixes: "include: .ts",
              files: 1,
              additions: 2,
              deletions: 3,
              changes: 5,
            },
          ],
          fallback: {
            label: "Other",
            suffixes: "その他",
            files: 0,
            additions: 0,
            deletions: 0,
            changes: 0,
          },
          total: { files: 1, additions: 2, deletions: 3, changes: 5 },
        },
        "abcdef012345",
      );

    expect(comment).toContain("| Runtime | include: .ts | 1 | 2 | 3 | 5 |");
    expect(comment).toContain("**合計:** 1 files, 2 additions, 3 deletions, 5 changes");
    expect(comment).toContain("対象 head commit: abcdef0");
  });
});
