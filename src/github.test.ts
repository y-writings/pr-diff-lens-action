import { Buffer } from "node:buffer";

import { describe, expect, it, vi } from "vitest";

const githubMock = vi.hoisted(() => ({ getOctokit: vi.fn() }));

vi.mock("@actions/github", () => githubMock);

import { createGitHubAdapter } from "./github.js";

describe("createGitHubAdapter", () => {
  it("reads the configuration file from the requested head SHA", async () => {
    const getContent = vi.fn(async () => ({
      data: {
        type: "file",
        encoding: "base64",
        content: Buffer.from('{"version":1}').toString("base64"),
      },
    }));
    githubMock.getOctokit.mockReturnValue({ rest: { repos: { getContent } } });

    const adapter = createGitHubAdapter("token-value");

    await expect(
      adapter.getFileContents("octo-org", "demo-repo", ".github/pr-diff-groups.json", "head-sha"),
    ).resolves.toBe('{"version":1}');
    expect(getContent).toHaveBeenCalledWith({
      owner: "octo-org",
      repo: "demo-repo",
      path: ".github/pr-diff-groups.json",
      ref: "head-sha",
    });
  });

  it("paginates pull request files with 100 results per page", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      filename: `src/file-${index}.ts`,
      additions: 1,
      deletions: 0,
    }));
    const listFiles = vi
      .fn()
      .mockResolvedValueOnce({ data: firstPage })
      .mockResolvedValueOnce({
        data: [{ filename: "src/final.ts", additions: 2, deletions: 1 }],
      });
    githubMock.getOctokit.mockReturnValue({ rest: { pulls: { listFiles } } });

    const adapter = createGitHubAdapter("token-value");

    await expect(adapter.listPullRequestFiles("octo-org", "demo-repo", 42)).resolves.toHaveLength(101);
    expect(listFiles).toHaveBeenNthCalledWith(1, {
      owner: "octo-org",
      repo: "demo-repo",
      pull_number: 42,
      per_page: 100,
      page: 1,
    });
    expect(listFiles).toHaveBeenNthCalledWith(2, {
      owner: "octo-org",
      repo: "demo-repo",
      pull_number: 42,
      per_page: 100,
      page: 2,
    });
  });

  it("paginates issue comments before finding a bot marker", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: index,
      body: "other comment",
      user: { login: "someone" },
    }));
    const listComments = vi
      .fn()
      .mockResolvedValueOnce({ data: firstPage })
      .mockResolvedValueOnce({
        data: [{ id: 101, body: "<!-- pr-diff-statistics -->", user: { login: "github-actions[bot]" } }],
      });
    githubMock.getOctokit.mockReturnValue({ rest: { issues: { listComments } } });

    const adapter = createGitHubAdapter("token-value");

    await expect(adapter.listIssueComments("octo-org", "demo-repo", 42)).resolves.toContainEqual({
      id: 101,
      body: "<!-- pr-diff-statistics -->",
      authorLogin: "github-actions[bot]",
    });
    expect(listComments).toHaveBeenNthCalledWith(1, {
      owner: "octo-org",
      repo: "demo-repo",
      issue_number: 42,
      per_page: 100,
      page: 1,
    });
    expect(listComments).toHaveBeenNthCalledWith(2, {
      owner: "octo-org",
      repo: "demo-repo",
      issue_number: 42,
      per_page: 100,
      page: 2,
    });
  });

  it("gets the current PR body and updates only its body field", async () => {
    const get = vi.fn(async () => ({ data: { body: null } }));
    const update = vi.fn(async () => ({ data: {} }));
    githubMock.getOctokit.mockReturnValue({ rest: { pulls: { get, update } } });
    const adapter = createGitHubAdapter("token-value");

    await expect(adapter.getPullRequestBody("octo-org", "demo-repo", 42)).resolves.toBe("");
    await adapter.updatePullRequestBody("octo-org", "demo-repo", 42, "new body");

    expect(get).toHaveBeenCalledWith({ owner: "octo-org", repo: "demo-repo", pull_number: 42 });
    expect(update).toHaveBeenCalledWith({
      owner: "octo-org",
      repo: "demo-repo",
      pull_number: 42,
      body: "new body",
    });
  });
});
