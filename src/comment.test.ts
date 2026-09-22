import { describe, expect, it } from "vitest";

import {
  escapeTableCell,
  PR_BODY_END_MARKER,
  PR_BODY_START_MARKER,
  renderStatisticsComment,
  updatePullRequestBody,
} from "./comment.js";

describe("escapeTableCell", () => {
  it("escapes table and code formatting characters", () => {
    expect(escapeTableCell("line one\r\nline|two`\\")).toBe("line one line\\|two\\`\\\\");
  });
});

describe("updatePullRequestBody", () => {
  const rendered = "<!-- pr-diff-statistics -->\n## PR Diff Statistics\n\nnew report";

  it("appends a marked section to empty and unmarked bodies without duplicating it", () => {
    const empty = updatePullRequestBody("", rendered);
    expect(empty).toBe(`${PR_BODY_START_MARKER}\n## PR Diff Statistics\n\nnew report\n${PR_BODY_END_MARKER}`);

    const appended = updatePullRequestBody("Introduction", rendered);
    expect(appended).toContain(`Introduction\n\n${PR_BODY_START_MARKER}`);
    expect(updatePullRequestBody(appended, rendered).match(/pr-diff-statistics:start/g)).toHaveLength(1);
  });

  it("preserves all content outside a valid marker pair", () => {
    expect(updatePullRequestBody(`before\n${PR_BODY_START_MARKER}\nold\n${PR_BODY_END_MARKER}\nafter`, rendered)).toBe(
      `before\n${PR_BODY_START_MARKER}\n## PR Diff Statistics\n\nnew report\n${PR_BODY_END_MARKER}\nafter`,
    );
  });

  it.each([
    [`${PR_BODY_START_MARKER}\nold`, "exactly one"],
    [`${PR_BODY_END_MARKER}\nold\n${PR_BODY_START_MARKER}`, "must appear before"],
    [`${PR_BODY_START_MARKER}${PR_BODY_END_MARKER}${PR_BODY_START_MARKER}`, "exactly one"],
  ])("rejects malformed markers", (body, message) => {
    expect(() => updatePullRequestBody(body, rendered)).toThrow(message);
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
