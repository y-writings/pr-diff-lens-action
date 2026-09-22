import { Buffer } from "node:buffer";

import { getOctokit } from "@actions/github";

import type { PullRequestFile } from "./config.js";

export interface IssueComment {
  id: number;
  body: string;
  authorLogin: string;
}

export interface GitHubAdapter {
  getFileContents(owner: string, repo: string, path: string, ref: string): Promise<string>;
  listPullRequestFiles(owner: string, repo: string, pullNumber: number): Promise<PullRequestFile[]>;
  listIssueComments(owner: string, repo: string, pullNumber: number): Promise<IssueComment[]>;
  createIssueComment(owner: string, repo: string, pullNumber: number, body: string): Promise<void>;
  updateIssueComment(owner: string, repo: string, commentId: number, body: string): Promise<void>;
  getPullRequestBody(owner: string, repo: string, pullNumber: number): Promise<string>;
  updatePullRequestBody(owner: string, repo: string, pullNumber: number, body: string): Promise<void>;
}

export function createGitHubAdapter(token: string): GitHubAdapter {
  const octokit = getOctokit(token);

  return {
    getFileContents: async (owner, repo, path, ref) => {
      const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref });
      if (Array.isArray(data) || data.type !== "file" || data.encoding !== "base64") {
        throw new Error(`config-path must resolve to a file: ${path}`);
      }
      if (typeof data.content !== "string") {
        throw new Error(`GitHub did not return file content for ${path}`);
      }
      return Buffer.from(data.content, "base64").toString("utf8");
    },
    listPullRequestFiles: async (owner, repo, pullNumber) => {
      const files: PullRequestFile[] = [];
      let page = 1;
      for (;;) {
        const { data } = await octokit.rest.pulls.listFiles({
          owner,
          repo,
          pull_number: pullNumber,
          per_page: 100,
          page,
        });
        files.push(...data.map(toPullRequestFile));
        if (data.length < 100) {
          return files;
        }
        page += 1;
      }
    },
    listIssueComments: async (owner, repo, pullNumber) => {
      const comments: IssueComment[] = [];
      let page = 1;
      for (;;) {
        const { data } = await octokit.rest.issues.listComments({
          owner,
          repo,
          issue_number: pullNumber,
          per_page: 100,
          page,
        });
        comments.push(
          ...data.map((comment) => ({
            id: comment.id,
            body: comment.body ?? "",
            authorLogin: comment.user?.login ?? "",
          })),
        );
        if (data.length < 100) {
          return comments;
        }
        page += 1;
      }
    },
    createIssueComment: async (owner, repo, pullNumber, body) => {
      await octokit.rest.issues.createComment({ owner, repo, issue_number: pullNumber, body });
    },
    updateIssueComment: async (owner, repo, commentId, body) => {
      await octokit.rest.issues.updateComment({ owner, repo, comment_id: commentId, body });
    },
    getPullRequestBody: async (owner, repo, pullNumber) => {
      const { data } = await octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber });
      return data.body ?? "";
    },
    updatePullRequestBody: async (owner, repo, pullNumber, body) => {
      await octokit.rest.pulls.update({ owner, repo, pull_number: pullNumber, body });
    },
  };
}

function toPullRequestFile(file: {
  filename?: string;
  additions?: number;
  deletions?: number;
}): PullRequestFile {
  if (
    typeof file.filename !== "string" ||
    typeof file.additions !== "number" ||
    typeof file.deletions !== "number"
  ) {
    throw new Error("GitHub returned an incomplete pull request file");
  }
  return { filename: file.filename, additions: file.additions, deletions: file.deletions };
}
