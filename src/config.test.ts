import { describe, expect, it } from "vitest";

import { summarize, validateConfig } from "./config.js";

const config = {
  version: 1,
  groups: [
    { id: "documentation", label: "Documentation", includeSuffixes: [".md"] },
    { id: "tests", label: "Tests", includeSuffixes: [".test.ts"] },
    {
      id: "runtime",
      label: "Runtime",
      includeSuffixes: [".ts"],
      excludeSuffixes: [".test.ts"],
    },
  ],
  fallbackLabel: "Other",
};

describe("validateConfig", () => {
  it("accepts the v1 schema", () => {
    expect(validateConfig(config)).toEqual({ ...config, output: "comment" });
  });

  it.each(["comment", "pr-body"] as const)("accepts the %s output", (output) => {
    expect(validateConfig({ ...config, output }).output).toBe(output);
  });

  it.each([
    ["version mismatch", { ...config, version: 2 }, "config.version must be 1"],
    ["invalid output", { ...config, output: "issue" }, 'config.output must be "comment" or "pr-body"'],
    ["invalid output type", { ...config, output: 1 }, 'config.output must be "comment" or "pr-body"'],
    ["empty groups", { ...config, groups: [] }, "config.groups must be a non-empty array"],
    [
      "duplicate group IDs",
      { ...config, groups: [config.groups[0], { ...config.groups[1], id: "documentation" }] },
      "config.groups[1].id must be unique",
    ],
    [
      "invalid suffix array",
      { ...config, groups: [{ ...config.groups[0], includeSuffixes: [""] }] },
      "config.groups[0].includeSuffixes must be a non-empty string array",
    ],
  ])("rejects %s", (_name, invalidConfig, message) => {
    expect(() => validateConfig(invalidConfig)).toThrow(message);
  });
});

describe("summarize", () => {
  it("does not classify an excluded suffix into its group", () => {
    const report = summarize(
      [{ filename: "src/lens.test.ts", additions: 1, deletions: 1 }],
      validateConfig({
        version: 1,
        groups: [
          {
            id: "runtime",
            label: "Runtime",
            includeSuffixes: [".ts"],
            excludeSuffixes: [".test.ts"],
          },
        ],
        fallbackLabel: "Other",
      }),
    );

    expect(report.groups[0]).toMatchObject({ files: 0, changes: 0 });
    expect(report.fallback).toMatchObject({ files: 1, changes: 2 });
  });

  it("classifies each file once and calculates group and total changes", () => {
    const report = summarize(
      [
        { filename: "README.md", additions: 2, deletions: 1 },
        { filename: "src/lens.test.ts", additions: 3, deletions: 2 },
        { filename: "src/lens.ts", additions: 4, deletions: 5 },
        { filename: "package.json", additions: 6, deletions: 7 },
      ],
      validateConfig(config),
    );

    expect(report.groups).toMatchObject([
      { label: "Documentation", files: 1, additions: 2, deletions: 1, changes: 3 },
      { label: "Tests", files: 1, additions: 3, deletions: 2, changes: 5 },
      { label: "Runtime", files: 1, additions: 4, deletions: 5, changes: 9 },
    ]);
    expect(report.fallback).toMatchObject({ files: 1, additions: 6, deletions: 7, changes: 13 });
    expect(report.total).toEqual({ files: 4, additions: 15, deletions: 15, changes: 30 });
  });
});
