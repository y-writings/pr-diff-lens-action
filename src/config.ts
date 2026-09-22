export interface DiffGroup {
  id: string;
  label: string;
  includeSuffixes: string[];
  excludeSuffixes?: string[];
}

export interface DiffConfig {
  version: 1;
  output: "comment" | "pr-body";
  groups: DiffGroup[];
  fallbackLabel: string;
}

export interface PullRequestFile {
  filename: string;
  additions: number;
  deletions: number;
}

export interface ChangeStatistics {
  label: string;
  suffixes: string;
  files: number;
  additions: number;
  deletions: number;
  changes: number;
}

export interface StatisticsReport {
  groups: ChangeStatistics[];
  fallback: ChangeStatistics;
  total: Omit<ChangeStatistics, "label" | "suffixes">;
}

export function parseConfig(content: string): DiffConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("config-path must contain valid JSON");
  }

  return validateConfig(parsed);
}

export function validateConfig(value: unknown): DiffConfig {
  if (!isRecord(value)) {
    throw new Error("config must be an object");
  }
  if (value.version !== 1) {
    throw new Error("config.version must be 1");
  }
  if (value.output !== undefined && value.output !== "comment" && value.output !== "pr-body") {
    throw new Error('config.output must be "comment" or "pr-body"');
  }
  if (!Array.isArray(value.groups) || value.groups.length === 0) {
    throw new Error("config.groups must be a non-empty array");
  }
  if (!isNonEmptyString(value.fallbackLabel)) {
    throw new Error("config.fallbackLabel must be a non-empty string");
  }

  const ids = new Set<string>();
  const groups = value.groups.map((group, index) => {
    if (!isRecord(group)) {
      throw new Error(`config.groups[${index}] must be an object`);
    }
    if (!isNonEmptyString(group.id)) {
      throw new Error(`config.groups[${index}].id must be a non-empty string`);
    }
    if (ids.has(group.id)) {
      throw new Error(`config.groups[${index}].id must be unique`);
    }
    ids.add(group.id);
    if (!isNonEmptyString(group.label)) {
      throw new Error(`config.groups[${index}].label must be a non-empty string`);
    }
    if (!isStringArray(group.includeSuffixes) || group.includeSuffixes.length === 0) {
      throw new Error(`config.groups[${index}].includeSuffixes must be a non-empty string array`);
    }
    if (group.excludeSuffixes !== undefined && !isStringArray(group.excludeSuffixes)) {
      throw new Error(`config.groups[${index}].excludeSuffixes must be a string array`);
    }

    return {
      id: group.id,
      label: group.label,
      includeSuffixes: group.includeSuffixes,
      excludeSuffixes: group.excludeSuffixes,
    };
  });

  return { version: 1, output: value.output ?? "comment", groups, fallbackLabel: value.fallbackLabel };
}

export function summarize(files: PullRequestFile[], config: DiffConfig): StatisticsReport {
  const groups = config.groups.map((group) => createStatistics(group.label, formatSuffixes(group)));
  const fallback = createStatistics(config.fallbackLabel, "その他");

  for (const file of files) {
    const groupIndex = config.groups.findIndex(
      (group) =>
        group.includeSuffixes.some((suffix) => file.filename.endsWith(suffix)) &&
        !group.excludeSuffixes?.some((suffix) => file.filename.endsWith(suffix)),
    );
    const statistics = groupIndex === -1 ? fallback : groups[groupIndex]!;
    addFile(statistics, file);
  }

  return {
    groups,
    fallback,
    total: files.reduce(
      (total, file) => ({
        files: total.files + 1,
        additions: total.additions + file.additions,
        deletions: total.deletions + file.deletions,
        changes: total.changes + file.additions + file.deletions,
      }),
      { files: 0, additions: 0, deletions: 0, changes: 0 },
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function createStatistics(label: string, suffixes: string): ChangeStatistics {
  return { label, suffixes, files: 0, additions: 0, deletions: 0, changes: 0 };
}

function formatSuffixes(group: DiffGroup): string {
  const included = `include: ${group.includeSuffixes.join(", ")}`;
  return group.excludeSuffixes ? `${included}; exclude: ${group.excludeSuffixes.join(", ")}` : included;
}

function addFile(statistics: ChangeStatistics, file: PullRequestFile): void {
  statistics.files += 1;
  statistics.additions += file.additions;
  statistics.deletions += file.deletions;
  statistics.changes += file.additions + file.deletions;
}
