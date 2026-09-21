import * as core from "@actions/core";
import { context as githubContext } from "@actions/github";

import { COMMENT_MARKER, renderStatisticsComment, renderUnavailableComment } from "../comment.js";
import { parseConfig, summarize } from "../config.js";
import { createGitHubAdapter, type GitHubAdapter } from "../github.js";

interface ActionsCore {
  getInput(name: string, options?: { required?: boolean }): string;
  setSecret(secret: string): void;
  warning(message: string): void;
  setFailed(message: string): void;
}

interface GitHubContextLike {
  repo: { owner: string; repo: string };
  issue: { number: number };
  payload: {
    pull_request?: {
      changed_files?: number;
      head?: { sha?: string };
    };
  };
}

interface RunDependencies {
  core: ActionsCore;
  context: GitHubContextLike;
  createGitHubAdapter(token: string): GitHubAdapter;
}

export async function run(dependencies: RunDependencies): Promise<void> {
  try {
    const githubToken = requiredInput(dependencies.core, "github-token");
    const configPath = configPathInput(dependencies.core);
    const pullRequest = pullRequestContext(dependencies.context);
    dependencies.core.setSecret(githubToken);

    const github = dependencies.createGitHubAdapter(githubToken);
    const { owner, repo } = dependencies.context.repo;
    const config = parseConfig(
      await github.getFileContents(owner, repo, configPath, pullRequest.headSha),
    );
    const files = await github.listPullRequestFiles(owner, repo, pullRequest.number);

    if (files.length !== pullRequest.changedFiles) {
      dependencies.core.warning(
        `GitHub returned ${files.length} of ${pullRequest.changedFiles} changed files; publishing no partial statistics.`,
      );
      await upsertComment(
        github,
        owner,
        repo,
        pullRequest.number,
        renderUnavailableComment(pullRequest.headSha),
      );
      return;
    }

    await upsertComment(
      github,
      owner,
      repo,
      pullRequest.number,
      renderStatisticsComment(summarize(files, config), pullRequest.headSha),
    );
  } catch (error) {
    dependencies.core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

export async function runAction(): Promise<void> {
  await run({
    core,
    context: githubContext as unknown as GitHubContextLike,
    createGitHubAdapter,
  });
}

function requiredInput(core: ActionsCore, name: string): string {
  const value = core.getInput(name, { required: true }).trim();
  if (value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function configPathInput(core: ActionsCore): string {
  const path = core.getInput("config-path").trim() || ".github/pr-diff-groups.json";
  if (path.startsWith("/") || path.split("/").includes("..")) {
    throw new Error("config-path must be repository-relative");
  }
  return path;
}

function pullRequestContext(context: GitHubContextLike): {
  number: number;
  changedFiles: number;
  headSha: string;
} {
  const pullRequest = context.payload.pull_request;
  const changedFiles = pullRequest?.changed_files;
  const headSha = pullRequest?.head?.sha;
  if (
    !pullRequest ||
    !Number.isSafeInteger(context.issue.number) ||
    context.issue.number < 1 ||
    typeof changedFiles !== "number" ||
    !Number.isSafeInteger(changedFiles) ||
    changedFiles < 0 ||
    typeof headSha !== "string" ||
    headSha.length === 0
  ) {
    throw new Error("PR Diff Lens must run on a pull_request event");
  }
  return {
    number: context.issue.number,
    changedFiles,
    headSha,
  };
}

async function upsertComment(
  github: GitHubAdapter,
  owner: string,
  repo: string,
  pullNumber: number,
  body: string,
): Promise<void> {
  const comment = (await github.listIssueComments(owner, repo, pullNumber)).find(
    (candidate) =>
      candidate.authorLogin === "github-actions[bot]" && candidate.body.includes(COMMENT_MARKER),
  );
  if (comment) {
    await github.updateIssueComment(owner, repo, comment.id, body);
    return;
  }
  await github.createIssueComment(owner, repo, pullNumber, body);
}
