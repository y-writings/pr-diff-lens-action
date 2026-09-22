import { describe, expect, it, vi } from "vitest";

import type { GitHubAdapter } from "../github.js";
import { run } from "./run.js";

const config = JSON.stringify({
  version: 1,
  groups: [{ id: "runtime", label: "Runtime", includeSuffixes: [".ts"] }],
  fallbackLabel: "Other",
});

function dependencies(overrides?: {
  content?: string;
  files?: Array<{ filename: string; additions: number; deletions: number }>;
  changedFiles?: number;
  comments?: Array<{ id: number; body: string; authorLogin: string }>;
  body?: string;
}) {
  const core = {
    getInput: vi.fn((name: string) =>
      name === "github-token" ? "token-value" : ".github/pr-diff-groups.json",
    ),
    setSecret: vi.fn(),
    warning: vi.fn(),
    setFailed: vi.fn(),
  };
  const github: GitHubAdapter = {
    getFileContents: vi.fn(async () => overrides?.content ?? config),
    listPullRequestFiles: vi.fn(async () => overrides?.files ?? [{ filename: "src/lens.ts", additions: 2, deletions: 1 }]),
    listIssueComments: vi.fn(async () => overrides?.comments ?? []),
    createIssueComment: vi.fn(async () => undefined),
    updateIssueComment: vi.fn(async () => undefined),
    getPullRequestBody: vi.fn(async () => overrides?.body ?? "Existing introduction"),
    updatePullRequestBody: vi.fn(async () => undefined),
  };

  return {
    core,
    github,
    dependencies: {
      core,
      context: {
        repo: { owner: "octo-org", repo: "demo-repo" },
        issue: { number: 42 },
        payload: {
          pull_request: {
            changed_files: overrides?.changedFiles ?? 1,
            head: { sha: "abcdef012345" },
          },
        },
      },
      createGitHubAdapter: vi.fn(() => github),
    },
  };
}

describe("run", () => {
  it("creates a statistics comment when no bot marker exists", async () => {
    const test = dependencies();

    await run(test.dependencies);

    expect(test.core.setFailed).not.toHaveBeenCalled();
    expect(test.github.createIssueComment).toHaveBeenCalledWith(
      "octo-org",
      "demo-repo",
      42,
      expect.stringContaining("<!-- pr-diff-statistics -->"),
    );
    expect(test.github.updateIssueComment).not.toHaveBeenCalled();
  });

  it("updates the existing bot marker comment", async () => {
    const test = dependencies({
      comments: [{ id: 7, authorLogin: "github-actions[bot]", body: "<!-- pr-diff-statistics -->\nold" }],
    });

    await run(test.dependencies);

    expect(test.github.updateIssueComment).toHaveBeenCalledWith(
      "octo-org",
      "demo-repo",
      7,
      expect.stringContaining("PR Diff Statistics"),
    );
    expect(test.github.createIssueComment).not.toHaveBeenCalled();
  });

  it("does not update a comment when the configuration is invalid", async () => {
    const test = dependencies({ content: "{not json" });

    await run(test.dependencies);

    expect(test.core.setFailed).toHaveBeenCalledWith("config-path must contain valid JSON");
    expect(test.github.listPullRequestFiles).not.toHaveBeenCalled();
    expect(test.github.listIssueComments).not.toHaveBeenCalled();
    expect(test.github.createIssueComment).not.toHaveBeenCalled();
    expect(test.github.updateIssueComment).not.toHaveBeenCalled();
  });

  it("fails without publishing statistics when GitHub cannot list files", async () => {
    const test = dependencies();
    vi.mocked(test.github.listPullRequestFiles).mockRejectedValue(new Error("GitHub API denied file access"));

    await run(test.dependencies);

    expect(test.core.setFailed).toHaveBeenCalledWith("GitHub API denied file access");
    expect(test.github.listIssueComments).not.toHaveBeenCalled();
    expect(test.github.createIssueComment).not.toHaveBeenCalled();
    expect(test.github.updateIssueComment).not.toHaveBeenCalled();
  });

  it("publishes an unavailable state instead of partial statistics", async () => {
    const test = dependencies({
      changedFiles: 3001,
      files: [{ filename: "src/lens.ts", additions: 2, deletions: 1 }],
    });

    await run(test.dependencies);

    expect(test.core.warning).toHaveBeenCalledWith(expect.stringContaining("publishing no partial statistics"));
    expect(test.github.createIssueComment).toHaveBeenCalledWith(
      "octo-org",
      "demo-repo",
      42,
      expect.stringContaining("GitHub APIの取得上限により集計不可"),
    );
    expect(test.github.createIssueComment).not.toHaveBeenCalledWith(
      "octo-org",
      "demo-repo",
      42,
      expect.stringContaining("| Runtime |"),
    );
  });

  it("updates only the marked PR body section in pr-body mode", async () => {
    const test = dependencies({
      content: JSON.stringify({ ...JSON.parse(config), output: "pr-body" }),
      body: "Intro\n\n<!-- pr-diff-statistics:start -->\nold\n<!-- pr-diff-statistics:end -->\n\nChecklist",
    });

    await run(test.dependencies);

    expect(test.github.getPullRequestBody).toHaveBeenCalledWith("octo-org", "demo-repo", 42);
    expect(test.github.updatePullRequestBody).toHaveBeenCalledWith(
      "octo-org",
      "demo-repo",
      42,
      expect.stringMatching(/^Intro[\s\S]*PR Diff Statistics[\s\S]*Checklist$/),
    );
    expect(test.github.listIssueComments).not.toHaveBeenCalled();
    expect(test.github.createIssueComment).not.toHaveBeenCalled();
  });

  it("publishes the unavailable state to the selected PR body", async () => {
    const test = dependencies({
      content: JSON.stringify({ ...JSON.parse(config), output: "pr-body" }),
      changedFiles: 3001,
    });

    await run(test.dependencies);

    expect(test.github.updatePullRequestBody).toHaveBeenCalledWith(
      "octo-org",
      "demo-repo",
      42,
      expect.stringContaining("GitHub APIの取得上限により集計不可"),
    );
    expect(test.github.createIssueComment).not.toHaveBeenCalled();
  });

  it("does not write a malformed PR body", async () => {
    const test = dependencies({
      content: JSON.stringify({ ...JSON.parse(config), output: "pr-body" }),
      body: "Intro\n<!-- pr-diff-statistics:start -->",
    });

    await run(test.dependencies);

    expect(test.core.setFailed).toHaveBeenCalledWith(expect.stringContaining("exactly one"));
    expect(test.github.updatePullRequestBody).not.toHaveBeenCalled();
  });
});
