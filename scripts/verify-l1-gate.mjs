#!/usr/bin/env node
/**
 * Isolated negative/positive probes for `.husky/pre-commit` (index-snapshot L1).
 * Uses temporary git repos under TMPDIR; does not mutate the real index.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const here = import.meta.dirname;
const repo = join(here, "..");
const owned = mkdtempSync(join(tmpdir(), "hooky-l1-gate-"));
let failed = 0;

const fixtureSource = `export function gateReady(value) {
  return typeof value === "string" && value.trim().length > 0;
}
`;
const passingTest = `import { expect, it } from "vitest";
import { gateReady } from "../src/gate-fixture.js";

it("accepts trimmed text", () => {
  expect(gateReady("a")).toBe(true);
  expect(gateReady("  ")).toBe(false);
});
`;
const failingTest = passingTest.replace("toBe(true)", "toBe(false)");

const baseVitest = readFileSync(join(repo, "vitest.config.js"), "utf8");
const minimalVitest = baseVitest
  .replace('include: ["tests/**/*.test.js"]', 'include: ["tests/gate-fixture.test.js"]')
  .replace('include: ["src/**/*.js"]', 'include: ["src/gate-fixture.js"]');

function check(name, ok, detail = "") {
  const text = ok ? detail.replace(/\s+/g, " ").slice(0, 320) : detail.trim().replace(/\s+/g, " ").slice(0, 480);
  console.log(`${ok ? "ok" : "FAIL"} ${name}${text ? `: ${text}` : ""}`);
  if (!ok) failed = 1;
}

function rootIndex() {
  return execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: repo, encoding: "utf8" });
}

const indexBefore = rootIndex();

function scratchOf(dir) {
  const scratch = join(dir, ".tmp");
  mkdirSync(scratch, { recursive: true });
  return scratch;
}

function resultOf(scratch, result) {
  return {
    status: result.status,
    signal: result.signal,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    leftovers: existsSync(scratch) ? readdirSync(scratch) : ["missing"],
  };
}

function snapshotGone(leftovers) {
  return leftovers.every((name) => !name.startsWith("hooky-index-"));
}

function fixture(name, extra = {}) {
  const dir = join(owned, name);
  for (const part of ["src", "tests", ".husky"]) mkdirSync(join(dir, part), { recursive: true });

  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "l1-gate@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "l1-gate"], { cwd: dir });

  writeFileSync(join(dir, ".gitignore"), "node_modules\ncoverage\n.tmp\n.cache\n");
  writeFileSync(join(dir, "package.json"), readFileSync(join(repo, "package.json"), "utf8"));
  writeFileSync(join(dir, "bun.lock"), readFileSync(join(repo, "bun.lock"), "utf8"));
  writeFileSync(join(dir, "vitest.config.js"), extra.vitest ?? minimalVitest);
  writeFileSync(join(dir, "eslint.config.mjs"), extra.eslint ?? readFileSync(join(repo, "eslint.config.mjs"), "utf8"));
  writeFileSync(join(dir, "tests/require-selected-tests.js"), readFileSync(join(repo, "tests/require-selected-tests.js"), "utf8"));
  writeFileSync(join(dir, ".husky/pre-commit"), readFileSync(join(repo, ".husky/pre-commit"), "utf8"));
  chmodSync(join(dir, ".husky/pre-commit"), 0o755);

  writeFileSync(join(dir, "src/gate-fixture.js"), fixtureSource);
  if (!extra.skipTest) {
    writeFileSync(join(dir, "tests/gate-fixture.test.js"), extra.test ?? passingTest);
  }
  if (extra.badLint) writeFileSync(join(dir, "src/gate-lint.js"), extra.badLint);
  if (extra.warnLint) writeFileSync(join(dir, "src/gate-warn.js"), extra.warnLint);
  if (extra.uncovered) writeFileSync(join(dir, "src/gate-gap.js"), extra.uncovered);

  symlinkSync(join(repo, "node_modules"), join(dir, "node_modules"));

  const paths = [
    ".gitignore",
    "package.json",
    "bun.lock",
    "vitest.config.js",
    "eslint.config.mjs",
    "tests/require-selected-tests.js",
    "tests/gate-fixture.test.js",
    "src/gate-fixture.js",
    ".husky/pre-commit",
  ].filter((p) => existsSync(join(dir, p)));

  if (extra.badLint) paths.push("src/gate-lint.js");
  if (extra.warnLint) paths.push("src/gate-warn.js");
  if (extra.uncovered) paths.push("src/gate-gap.js");
  if (extra.skipTest) {
    const probePath = join(dir, "tests/gate-fixture.test.js");
    if (existsSync(probePath)) {
      execFileSync("git", ["rm", "-f", "--cached", "tests/gate-fixture.test.js"], { cwd: dir });
      rmSync(probePath);
    }
  }

  execFileSync("git", ["add", "--", ...paths], { cwd: dir });

  if (extra.worktreeTest) writeFileSync(join(dir, "tests/gate-fixture.test.js"), extra.worktreeTest);

  return dir;
}

function runHook(dir, { env = {}, timeout } = {}) {
  const scratch = scratchOf(dir);
  return resultOf(
    scratch,
    spawnSync("sh", [".husky/pre-commit"], {
      cwd: dir,
      env: { ...process.env, TMPDIR: scratch, ...env },
      encoding: "utf8",
      timeout,
    }),
  );
}

function runHookInterrupt(dir) {
  const scratch = scratchOf(dir);
  return new Promise((resolve) => {
    const child = spawn("sh", [".husky/pre-commit"], {
      cwd: dir,
      env: { ...process.env, TMPDIR: scratch, HOOKY_L1_TIMEOUT_SEC: "120" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
  let out = "";
  child.stdout?.on("data", (chunk) => {
    out += chunk;
  });
  child.stderr?.on("data", (chunk) => {
    out += chunk;
  });
  const timer = setTimeout(() => {
    try {
      process.kill(-child.pid, "SIGINT");
    } catch {
      child.kill("SIGINT");
    }
  }, 1500);
  child.on("close", (status, signal) => {
    clearTimeout(timer);
    resolve(
      resultOf(scratch, {
        status: status ?? 1,
        signal,
        stdout: out,
        stderr: "",
      }),
    );
  });
  });
}

// Static eslint fragment for warning-only fixture (no dynamic import in fixture setup).
const warningEslint = `import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.js", "tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser, chrome: "readonly" },
    },
    rules: {
      "no-console": "warn",
    },
  },
];
`;

const branchGapSource = `export function branchy(n) {
  if (n === 1) return "a";
  if (n === 2) return "b";
  if (n === 3) return "c";
  return "d";
}
`;

try {
  const healthyDir = fixture("healthy");
  const healthy = runHook(healthyDir);
  check("healthy index snapshot exits 0", healthy.status === 0, healthy.output);
  check("healthy removes snapshot temp dir", snapshotGone(healthy.leftovers), healthy.leftovers.join(","));

  const utDir = fixture("ut-fail", { test: failingTest, worktreeTest: passingTest });
  const ut = runHook(utDir);
  check(
    "staged unit test failure rejects",
    ut.status !== 0 && /AssertionError|expected false|FAIL/i.test(ut.output),
    ut.output,
  );
  check(
    "UT probe leaves unstaged worktree fix",
    readFileSync(join(utDir, "tests/gate-fixture.test.js"), "utf8") === passingTest,
  );
  check(
    "UT probe keeps failing staged index",
    execFileSync("git", ["show", ":tests/gate-fixture.test.js"], { cwd: utDir, encoding: "utf8" }).includes(
      "toBe(false)",
    ),
  );

  const gapBody = `export function gateGap() {
  if (Math.random() > 2) return 1;
  return 0;
}
`;
  const coverageDir = fixture("coverage-low", {
    uncovered: gapBody,
    vitest: minimalVitest.replace(
      'include: ["src/gate-fixture.js"]',
      'include: ["src/gate-fixture.js", "src/gate-gap.js"]',
    ),
  });
  const coverage = runHook(coverageDir);
  check(
    "coverage below floor rejects",
    coverage.status !== 0 && /threshold|Coverage/i.test(coverage.output),
    coverage.output,
  );

  const branchVitest = minimalVitest.replace(
    'include: ["src/gate-fixture.js"]',
    'include: ["src/gate-fixture.js", "src/gate-gap.js"]',
  );
  const branchDir = fixture("coverage-branch", {
    uncovered: branchGapSource,
    vitest: branchVitest,
  });
  const branch = runHook(branchDir);
  check(
    "single-metric coverage shortfall rejects",
    branch.status !== 0 && /branch/i.test(branch.output),
    branch.output,
  );

  const lintDir = fixture("lint-error", {
    badLint: `export function gateLint() {
  debugger;
}
`,
  });
  const lint = runHook(lintDir);
  check(
    "eslint error rejects",
    lint.status !== 0 && /no-debugger|error/i.test(lint.output),
    lint.output,
  );

  const warningDir = fixture("lint-warning", {
    eslint: warningEslint,
    warnLint: `export function gateWarn() {
  console.log("probe");
}
`,
  });
  const warning = runHook(warningDir);
  check(
    "eslint warning alone rejects (--max-warnings=0)",
    warning.status !== 0 &&
      (/warning/i.test(warning.output) || /max-warnings/i.test(warning.output) || warning.status === 1),
    warning.output,
  );

  const onlyTest = `import { expect, it } from "vitest";
it.only("focused", () => { expect(1).toBe(1); });
`;
  const onlyDir = fixture("focused", { test: onlyTest });
  const only = runHook(onlyDir);
  check("focused .only rejects", only.status !== 0 && /only|focused/i.test(only.output), only.output);

  const skipTest = `${passingTest}
it.skip("silent", () => { expect(1).toBe(2); });
`;
  const skipDir = fixture("skipped", { test: skipTest });
  const skip = runHook(skipDir);
  check("committed .skip rejects", skip.status !== 0 && /skip/i.test(skip.output), skip.output);

  const emptyDir = fixture("empty-suite", { skipTest: true });
  const empty = runHook(emptyDir);
  check(
    "empty suite rejects",
    empty.status !== 0 && /no test files|empty|required selected/i.test(empty.output),
    empty.output,
  );

  const hangTest = `${passingTest}
it("hangs", () => new Promise(() => {}));
`;
  const timeoutDir = fixture("timeout", { test: hangTest });
  const timed = runHook(timeoutDir, { env: { HOOKY_L1_TIMEOUT_SEC: "2" }, timeout: 120_000 });
  check(
    "bounded gate timeout rejects",
    timed.status !== 0 && timed.status !== null,
    `status=${timed.status} signal=${timed.signal} ${timed.output}`,
  );
  check("timeout removes snapshot temp dir", snapshotGone(timed.leftovers), timed.leftovers.join(","));

  const interruptDir = fixture("interrupt", { test: hangTest });
  const interrupted = await runHookInterrupt(interruptDir);
  check(
    "interrupt rejects (SIGINT)",
    interrupted.status !== 0 || interrupted.signal === "SIGINT",
    `status=${interrupted.status} signal=${interrupted.signal}`,
  );
  check("interrupt removes snapshot temp dir", snapshotGone(interrupted.leftovers), interrupted.leftovers.join(","));

  const missingBin = join(owned, "bin");
  mkdirSync(missingBin, { recursive: true });
  symlinkSync(
    execFileSync("command", ["-v", "git"], { encoding: "utf8", shell: true }).trim(),
    join(missingBin, "git"),
  );
  const missingDir = fixture("missing-bun");
  const missing = runHook(missingDir, { env: { PATH: `${missingBin}:/usr/bin:/bin` } });
  check(
    "missing bun rejects",
    missing.status !== 0 && /bun is required/i.test(missing.output),
    missing.output,
  );

  const noCoverageDir = fixture("no-coverage-script");
  const pkgNoCov = JSON.parse(readFileSync(join(noCoverageDir, "package.json"), "utf8"));
  pkgNoCov.scripts["test:coverage"] = "vitest run";
  writeFileSync(join(noCoverageDir, "package.json"), `${JSON.stringify(pkgNoCov, null, 2)}\n`);
  execFileSync("git", ["add", "--", "package.json"], { cwd: noCoverageDir });
  const noCov = runHook(noCoverageDir);
  check(
    "vitest run without --coverage rejects",
    noCov.status !== 0,
    noCov.output,
  );

  check("repository index untouched", rootIndex() === indexBefore);
} finally {
  rmSync(owned, { recursive: true, force: true });
}

if (failed) process.exit(failed);
console.log("L1 gate probes passed");
