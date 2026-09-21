# PR Diff Lens

`PR Diff Lens` is a JavaScript GitHub Action that publishes grouped pull request
change statistics in one stable PR conversation comment. It reads the changed
file metadata and configuration through the GitHub API; it does not check out
or execute pull request code.

## Caller workflow

Create `.github/workflows/pr-diff-statistics.yml` in the repository that owns
the pull requests. Replace `<FULL_COMMIT_SHA>` with a full commit SHA from this
action; do not use a mutable tag.

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
      - uses: y-writings/pr-diff-lens-action@<FULL_COMMIT_SHA>
        with:
          github-token: ${{ github.token }}
          config-path: .github/pr-diff-groups.json
```

The job-level condition skips external forks without failing the workflow.
Do not replace `pull_request` with `pull_request_target`.

## Configuration

Create `.github/pr-diff-groups.json` in the repository. The action reads this
file at the PR head commit, so a configuration change takes effect in the same
run.

```json
{
  "version": 1,
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

`version` must be `1`. `groups` must be non-empty; every group needs a unique,
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

The caller needs only `contents: read`, `pull-requests: read`, and
`issues: write` permissions.

## Behavior and limits

The action retrieves paginated pull request files and issue comments, then
creates or updates the comment identified by `<!-- pr-diff-statistics -->` and
the `github-actions[bot]` author. The comment contains a row for every group
and fallback, with file, addition, deletion, and changed-line totals plus the
short head SHA. It never changes the PR title or body.

GitHub's List pull request files API returns at most 3,000 files. If its
returned count differs from the event's `changed_files` count, the action
replaces the stable comment with `GitHub APIの取得上限により集計不可`, records a
warning, and succeeds. It does not use checkout, Git, extra APIs, retries,
caching, or alternate fallbacks to calculate a partial result.

Invalid, missing, or non-file configuration fails the action before any comment
is created or updated. GitHub API failures also fail the action with the
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
