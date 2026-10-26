#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

// DOCS_02: enumerate tracked files plus untracked files that are not ignored, so
// git-ignored local outputs (outputs/**, .acceptance/**) are never checked as docs.
function repositoryFiles() {
  let listing;
  try {
    listing = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    failures.push({ kind: "enumeration", file: ".", reason: `git ls-files failed: ${error.message}` });
    return [];
  }
  const files = new Set();
  for (const name of listing.split("\0")) {
    if (!name) continue;
    recordRepositoryPath(name);
    const filename = path.join(root, name);
    // --cached still lists files deleted from the working tree.
    if (fs.existsSync(filename)) files.add(filename);
  }
  return [...files];
}

// DOCS_04: repository membership for link targets, built from the same enumeration.
// Keys are "/"-separated paths relative to the repository root.
const repositoryPaths = new Set();
const repositoryDirectories = new Set();
const repositoryPathsByLowerCase = new Map();

function recordRepositoryPath(name) {
  repositoryPaths.add(name);
  repositoryPathsByLowerCase.set(name.toLowerCase(), name);
  let directory = path.posix.dirname(name);
  while (directory !== "." && !repositoryDirectories.has(directory)) {
    repositoryDirectories.add(directory);
    repositoryPathsByLowerCase.set(directory.toLowerCase(), directory);
    directory = path.posix.dirname(directory);
  }
}

function repositoryMembershipFailure(resolved) {
  const rel = path.relative(root, resolved);
  if (rel === "") return null;
  if (rel.startsWith("..") || path.isAbsolute(rel)) return "target is outside the repository";
  const key = rel.split(path.sep).join("/");
  if (repositoryPaths.has(key) || repositoryDirectories.has(key)) return null;
  const actual = repositoryPathsByLowerCase.get(key.toLowerCase());
  if (actual) return `target case differs from repository path ${actual}`;
  return "target is not part of the repository";
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
      continue;
    }
    const membership = repositoryMembershipFailure(resolved);
    if (membership) failures.push({ kind: "link", file: relative(filename), target, reason: membership });
  }
}

const docFiles = repositoryFiles().filter((filename) => {
  const rel = relative(filename);
  return (
    /^(?:docs\/).*\.(?:md|html)$/i.test(rel) ||
    /(?:^|\/)(?:README|AGENTS|CLAUDE)\.md$/i.test(rel)
  );
});

// DOCS_05 (ADR-0191): reports dated on or after the OUTPUT_STYLE effective date must not
// use W05 vague wording. Code, block quotes and Chinese quotations (verbatim citations) are skipped.
const vagueWordingEffectiveDate = "2026-10-06";
const vagueWording = /基本通过|基本完成|基本可用|基本没问题|应该可以|应该没问题|应该能|大概|差不多|理论上|预计通过|估计|似乎|好像/g;

function inVagueWordingScope(rel) {
  const match = rel.split(path.sep).join("/").match(/^docs\/reports\/.+_(\d{4}-\d{2}-\d{2})\.md$/);
  return Boolean(match) && match[1] >= vagueWordingEffectiveDate;
}

function checkVagueWording(filename, source) {
  let fenced = false;
  source.split("\n").forEach((line, index) => {
    if (/^\s*(?:```|~~~)/.test(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced || /^\s*>/.test(line)) return;
    const text = line.replace(/`[^`]*`/g, "").replace(/“[^”]*”/g, "").replace(/「[^」]*」/g, "");
    for (const match of text.matchAll(vagueWording)) {
      failures.push({
        kind: "vague-wording",
        file: relative(filename),
        line: index + 1,
        reason: `OUTPUT_STYLE W05 vague wording "${match[0]}"`,
      });
    }
  });
}

for (const filename of docFiles) {
  const source = fs.readFileSync(filename, "utf8");
  checkLinks(filename, source);
  if (inVagueWordingScope(relative(filename))) checkVagueWording(filename, source);
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
const taskLifecycleHeadings = [...taskIndexSource.matchAll(/^##\s+(.+)$/gm)];
const taskLifecycleSections = new Set(["当前工作与待批准任务", "已关闭任务", "历史合同与保留事项"]);
const lifecycleIndexedNames = new Set();
for (const match of taskIndexSource.matchAll(taskIndexRows)) {
  const name = path.basename(match[1]);
  const metadata = taskMetadata.get(name);
  if (!metadata) {
    failures.push({ kind: "task-index", file: "docs/tasks/README.md", reason: `unknown task ${name}` });
    continue;
  }
  lifecycleIndexedNames.add(name);
  const section = taskLifecycleHeadings.filter((heading) => heading.index < match.index).at(-1)?.[1].trim();
  if (!taskLifecycleSections.has(section)) {
    failures.push({ kind: "task-lifecycle", file: "docs/tasks/README.md", reason: `${name} has no recognized lifecycle section` });
  } else if ((section === "已关闭任务") !== (metadata.Status === "COMPLETE")) {
    failures.push({ kind: "task-lifecycle", file: "docs/tasks/README.md", reason: `${name} COMPLETE status must appear only in 已关闭任务` });
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
for (const name of taskMetadata.keys()) {
  if (!lifecycleIndexedNames.has(name)) {
    failures.push({ kind: "task-lifecycle", file: "docs/tasks/README.md", reason: `${name} needs a complete lifecycle table row` });
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
  return section.replace(/^-\s+(?:状态|Status)\s*[:：].*$/mi, "").trimEnd();
}

// DOCS_06: existing ADRs use both Chinese and English status labels.
function adrStatus(section) {
  const raw = section.match(/^-\s+(?:状态|Status)\s*[:：]\s*(.+)$/mi)?.[1];
  if (!raw) return undefined;
  return raw.split(/[（(]/, 1)[0].trim();
}

const currentAdrSections = adrSections(decisions);
for (const [id, section] of currentAdrSections) {
  if (!/^(?:Accepted|Proposed|Superseded)\b/.test(adrStatus(section) ?? "")) {
    failures.push({ kind: "adr-metadata", file: "docs/DECISIONS.md", reason: `ADR-${id} has no recognized status` });
  }
}

const adrIndexFile = path.join(root, "docs", "DECISIONS_INDEX.md");
if (!fs.existsSync(adrIndexFile)) {
  failures.push({ kind: "adr-index", file: "docs/DECISIONS_INDEX.md", reason: "ADR index is missing" });
} else {
  const adrIndex = new Map();
  const source = fs.readFileSync(adrIndexFile, "utf8");
  for (const match of source.matchAll(/^\|\s*ADR-(\d{4})\s*\|([^|\n]*)\|([^|\n]*)\|\s*$/gm)) {
    const id = match[1];
    if (adrIndex.has(id)) {
      failures.push({ kind: "adr-index", file: "docs/DECISIONS_INDEX.md", reason: `duplicate ADR-${id} index row` });
    }
    adrIndex.set(id, { title: match[2].trim(), status: match[3].trim() });
  }
  for (const [id, section] of currentAdrSections) {
    const indexed = adrIndex.get(id);
    if (!indexed) {
      failures.push({ kind: "adr-index", file: "docs/DECISIONS_INDEX.md", reason: `ADR-${id} is missing from index` });
      continue;
    }
    const title = section.match(/^##\s+ADR-\d{4}\s+(.+)$/m)?.[1].trim();
    if (indexed.title !== title) {
      failures.push({ kind: "adr-index", file: "docs/DECISIONS_INDEX.md", reason: `ADR-${id} index title differs from body` });
    }
    if (indexed.status !== adrStatus(section)) {
      failures.push({ kind: "adr-index", file: "docs/DECISIONS_INDEX.md", reason: `ADR-${id} index status differs from body` });
    }
  }
  for (const id of adrIndex.keys()) {
    if (!currentAdrSections.has(id)) {
      failures.push({ kind: "adr-index", file: "docs/DECISIONS_INDEX.md", reason: `ADR-${id} index row has no body` });
    }
  }
}

try {
  const headDecisions = execFileSync("git", ["show", "HEAD:docs/DECISIONS.md"], {
    cwd: root,
    encoding: "utf8",
  });
  const headSections = adrSections(headDecisions);
  const currentSections = currentAdrSections;
  for (const [id, headSection] of headSections) {
    if (!/^Accepted\b/.test(adrStatus(headSection) ?? "")) continue;
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
