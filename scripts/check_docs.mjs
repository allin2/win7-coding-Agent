#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function walk(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(filename));
    else files.push(filename);
  }
  return files;
}

function relative(filename) {
  return path.relative(root, filename) || ".";
}

function isExternal(target) {
  return !target || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(target);
}

function checkLinks(filename, source) {
  const links = [];
  const markdown = /\]\(([^)\n]+)\)/g;
  const html = /\b(?:href|src)=["']([^"']+)["']/gi;
  for (const match of source.matchAll(markdown)) links.push(match[1].trim());
  for (const match of source.matchAll(html)) links.push(match[1].trim());

  for (let target of links) {
    if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
    target = target.split("#", 1)[0].split("?", 1)[0];
    if (isExternal(target)) continue;
    let decoded;
    try {
      decoded = decodeURIComponent(target);
    } catch {
      failures.push({ kind: "link", file: relative(filename), target, reason: "invalid URI encoding" });
      continue;
    }
    const resolved = path.resolve(path.dirname(filename), decoded);
    if (!fs.existsSync(resolved)) {
      failures.push({ kind: "link", file: relative(filename), target, reason: "target does not exist" });
    }
  }
}

const docFiles = walk(root).filter((filename) => {
  const rel = relative(filename);
  return (
    /^(?:docs\/).*\.(?:md|html)$/i.test(rel) ||
    /(?:^|\/)(?:README|AGENTS|CLAUDE)\.md$/i.test(rel)
  );
});

for (const filename of docFiles) {
  const source = fs.readFileSync(filename, "utf8");
  checkLinks(filename, source);
  if (source.includes("docs/tasks/active/")) {
    failures.push({ kind: "stable-task-path", file: relative(filename), reason: "obsolete active/ task path" });
  }
}

const taskFiles = fs.readdirSync(path.join(root, "docs", "tasks"))
  .filter((name) => name.endsWith(".md") && name !== "README.md")
  .map((name) => path.join(root, "docs", "tasks", name));
const taskMetadata = new Map();

function readMetadata(source, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`^${escaped}:\\s*(.+?)\\s*$`, "m"))?.[1].trim();
}

for (const filename of taskFiles) {
  const source = fs.readFileSync(filename, "utf8");
  for (const field of ["Status", "Task Type"]) {
    if (!readMetadata(source, field)) {
      failures.push({ kind: "task-metadata", file: relative(filename), reason: `missing ${field}` });
    }
  }
  taskMetadata.set(path.basename(filename), {
    "Task Type": readMetadata(source, "Task Type"),
    Status: readMetadata(source, "Status"),
    "Phase-Gate": readMetadata(source, "Phase-Gate"),
    "Win7-Validation": readMetadata(source, "Win7-Validation"),
  });
}

const taskIndexFile = path.join(root, "docs", "tasks", "README.md");
const taskIndexSource = fs.readFileSync(taskIndexFile, "utf8");
const indexedTaskNames = [
  ...taskIndexSource.matchAll(/\]\(([^)\s]+\.md)\)/g),
].map((match) => path.basename(match[1]));
for (const filename of taskFiles) {
  const name = path.basename(filename);
  const references = indexedTaskNames.filter((indexedName) => indexedName === name).length;
  if (references !== 1) {
    failures.push({
      kind: "task-index",
      file: "docs/tasks/README.md",
      reason: `${name} must be indexed exactly once; found ${references}`,
    });
  }
}

const taskIndexRows =
  /^\|[ \t]*\[[^\]]+\]\(([^)\n]+\.md)\)[ \t]*\|[ \t]*([^\n|]*?)[ \t]*\|[ \t]*([^\n|]*?)[ \t]*\|[ \t]*([^\n|]*?)[ \t]*\|[ \t]*([^\n|]*?)[ \t]*\|$/gm;
for (const match of taskIndexSource.matchAll(taskIndexRows)) {
  const name = path.basename(match[1]);
  const metadata = taskMetadata.get(name);
  if (!metadata) {
    failures.push({ kind: "task-index", file: "docs/tasks/README.md", reason: `unknown task ${name}` });
    continue;
  }
  const indexed = {
    "Task Type": match[2].trim(),
    Status: match[3].trim(),
    "Phase-Gate": match[4].trim(),
    "Win7-Validation": match[5].trim(),
  };
  for (const field of Object.keys(indexed)) {
    if (metadata[field] && metadata[field] !== indexed[field]) {
      failures.push({
        kind: "task-index",
        file: "docs/tasks/README.md",
        reason: `${name} ${field} is ${indexed[field]}, expected ${metadata[field]}`,
      });
    }
  }
}

const decisions = fs.readFileSync(path.join(root, "docs", "DECISIONS.md"), "utf8");
const adrIds = [...decisions.matchAll(/^##\s+ADR-(\d{4})\b/gm)].map((match) => match[1]);
const duplicateAdrIds = adrIds.filter((id, index) => adrIds.indexOf(id) !== index);
for (const id of new Set(duplicateAdrIds)) {
  failures.push({ kind: "adr", file: "docs/DECISIONS.md", reason: `duplicate ADR-${id}` });
}

function adrSections(source) {
  const headings = [...source.matchAll(/^##\s+ADR-(\d{4})\b.*$/gm)];
  const sections = new Map();
  for (let index = 0; index < headings.length; index += 1) {
    const start = headings[index].index;
    const end = headings[index + 1]?.index ?? source.length;
    sections.set(headings[index][1], source.slice(start, end).trimEnd());
  }
  return sections;
}

function adrImmutableBody(section) {
  return section.replace(/^- 状态：.*$/m, "").trimEnd();
}

try {
  const headDecisions = execFileSync("git", ["show", "HEAD:docs/DECISIONS.md"], {
    cwd: root,
    encoding: "utf8",
  });
  const headSections = adrSections(headDecisions);
  const currentSections = adrSections(decisions);
  for (const [id, headSection] of headSections) {
    if (!/^- 状态：Accepted\b/m.test(headSection)) continue;
    const currentSection = currentSections.get(id);
    if (!currentSection || adrImmutableBody(currentSection) !== adrImmutableBody(headSection)) {
      failures.push({
        kind: "adr-immutability",
        file: "docs/DECISIONS.md",
        reason: `Accepted ADR-${id} body differs from HEAD`,
      });
    }
  }
} catch (error) {
  failures.push({
    kind: "adr-immutability",
    file: "docs/DECISIONS.md",
    reason: `cannot read HEAD baseline: ${error.message}`,
  });
}

const validationFile = path.join(root, "docs", "status", "latest-validation.json");
try {
  const validation = JSON.parse(fs.readFileSync(validationFile, "utf8"));
  if (![1, 2].includes(validation.schema_version) || !/^[0-9a-f]{40}$/i.test(validation.head_commit ?? "")) {
    failures.push({ kind: "status", file: "docs/status/latest-validation.json", reason: "missing schema_version=1|2 or 40-hex head_commit" });
  } else {
    const actualHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const statusSource = fs.readFileSync(path.join(root, "docs", "STATUS.md"), "utf8");
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", validation.head_commit, actualHead], {
        cwd: root,
        stdio: "ignore",
      });
    } catch {
      failures.push({
        kind: "status",
        file: "docs/status/latest-validation.json",
        reason: `evidence head_commit is not reachable from HEAD ${actualHead}`,
      });
    }
    if (!statusSource.includes(`\`${validation.head_commit}\``)) {
      failures.push({ kind: "status", file: "docs/STATUS.md", reason: "HEAD does not match latest-validation.json" });
    }
    if (validation.candidate_commit) {
      const candidateCommit = execFileSync("git", ["rev-parse", "--verify", `${validation.candidate_commit}^{commit}`], {
        cwd: root,
        encoding: "utf8",
      }).trim();
      if (candidateCommit !== validation.candidate_commit) {
        failures.push({ kind: "status", file: "docs/status/latest-validation.json", reason: "candidate_commit is not an exact commit id" });
      }
      if (validation.candidate_tag) {
        const candidateTagCommit = execFileSync("git", ["rev-list", "-n", "1", validation.candidate_tag], {
          cwd: root,
          encoding: "utf8",
        }).trim();
        if (candidateTagCommit !== validation.candidate_commit) {
          failures.push({ kind: "status", file: "docs/status/latest-validation.json", reason: "candidate_tag does not resolve to candidate_commit" });
        }
      }
    }
  }
} catch (error) {
  failures.push({ kind: "status", file: "docs/status/latest-validation.json", reason: `status validation failed: ${error.message}` });
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, checked_files: docFiles.length, task_files: taskFiles.length }));
}
