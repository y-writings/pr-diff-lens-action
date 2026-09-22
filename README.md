# PR Diff Lens

`PR Diff Lens` is a JavaScript GitHub Action that publishes grouped pull request
change statistics in one stable PR conversation comment or a marked section of
the PR body. It reads the changed
file metadata and configuration through the GitHub API; it does not check out
or execute pull request code.

## Caller workflow

Create `.github/workflows/pr-diff-statistics.yml` in the repository that owns
the pull requests. Pin this action to a full commit SHA; do not use a mutable
tag.

```yaml
name: PR diff statistics

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: read
  issues: write

concurrency:
  group: pr-diff-statistics-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  update-comment:
    if: github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    steps:
      - uses: y-writings/pr-diff-lens-action@25c3dfdc157688d98bd0effdc58dc54930e77084
        with:
          github-token: ${{ github.token }}
          config-path: .github/pr-diff-groups.json
```

The job-level condition skips external forks without failing the workflow.
Do not replace `pull_request` with `pull_request_target`.

The example above is for the default comment output. For PR body output, use
the same workflow with these permissions (the `issues: write` permission is not
needed):

```yaml
permissions:
  contents: read
  pull-requests: write
```

## Configuration

Create `.github/pr-diff-groups.json` in the repository. The action reads this
file at the PR head commit, so a configuration change takes effect in the same
run.

```json
{
  "version": 1,
  "output": "comment",
  "groups": [
    {
      "id": "documentation",
      "label": "Documentation",
      "includeSuffixes": [".md"]
    },
    {
      "id": "tests",
      "label": "Tests",
      "includeSuffixes": [".test.ts"]
    },
    {
      "id": "runtime",
      "label": "Runtime",
      "includeSuffixes": [".ts"],
      "excludeSuffixes": [".test.ts"]
    }
  ],
  "fallbackLabel": "Other"
}
```

`version` must be `1`. The optional `output` must be `"comment"` or `"pr-body"`;
when omitted it defaults to `"comment"`, so existing configuration remains
compatible. Set `"output": "pr-body"` to publish into the marked PR body
section described below. `groups` must be non-empty; every group needs a unique,
non-empty `id` and label, plus a non-empty `includeSuffixes` array. An optional
`excludeSuffixes` must be an array of non-empty strings. `fallbackLabel` must
be non-empty.

Groups are evaluated in order. A file is assigned only to the first group for
which its name ends with an included suffix and does not end with an excluded
suffix. Unmatched files are assigned to `fallbackLabel`. Globs, regular
expressions, directory rules, and scripts are not supported.

## Inputs and permissions

- `github-token` is optional and defaults to `${{ github.token }}`. It grants
  GitHub API access.
- `config-path` is optional and defaults to `.github/pr-diff-groups.json`. It
  identifies the config at the PR head.

Comment mode needs `contents: read`, `pull-requests: read`, and `issues: write`.
PR body mode needs `contents: read` and `pull-requests: write`.

## Behavior and limits

In comment mode, the action retrieves paginated pull request files and issue
comments, then creates or updates the comment identified by
`<!-- pr-diff-statistics -->` and the `github-actions[bot]` author.

In PR body mode, you may place this section wherever the result should appear
in the body or PR template:

```markdown
<!-- pr-diff-statistics:start -->
The action replaces only this content.
<!-- pr-diff-statistics:end -->
```

Exactly one correctly ordered marker pair is updated in place, preserving all
content outside it. If neither marker exists, the action appends a marked
section to the body (including an empty body). Re-runs update that same section.
A missing, reversed, or duplicate marker causes the action to fail without
updating the body. The latest body is fetched immediately before it is updated,
and the PR title is never changed.

Both destinations contain a row for every group and fallback, with file,
addition, deletion, and changed-line totals plus the short head SHA. Switching
destinations does not remove output previously written to the other destination.

GitHub's List pull request files API returns at most 3,000 files. If its
returned count differs from the event's `changed_files` count, the action
updates the selected destination with `GitHub APIの取得上限により集計不可`,
records a warning, and succeeds. It does not use checkout, Git, extra APIs, retries,
caching, or alternate fallbacks to calculate a partial result.

Invalid, missing, or non-file configuration fails the action before either
destination is updated. GitHub API failures also fail the action with the
underlying error.

## Development with Docker

Docker is the supported development environment. From the repository root:

```sh
docker compose build
docker compose run --rm action pnpm check
```

The bind-mounted compose service keeps dependencies in the named
`node_modules` volume. Use the same command after source changes; `pnpm check`
runs type checking, tests, and the committed Action bundle build.
