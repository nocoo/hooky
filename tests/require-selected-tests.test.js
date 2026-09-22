import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vitestBin = path.join(root, "node_modules/vitest/vitest.mjs");
const reporterPath = path.join(root, "tests/require-selected-tests.js");
const sharedViteCache = path.join(root, "node_modules/.vite");
const roots = [];

function newestMtime(dir) {
  if (!existsSync(dir)) return 0;
  const stat = statSync(dir);
  let newest = stat.mtimeMs;
  if (!stat.isDirectory()) return newest;
  for (const name of readdirSync(dir)) newest = Math.max(newest, newestMtime(path.join(dir, name)));
  return newest;
}

afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function runFixture(source) {
  const dir = mkdtempSync(path.join(tmpdir(), "hooky-selected-"));
  roots.push(dir);
  symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
  const cacheDir = path.join(dir, "cache");
  writeFileSync(path.join(dir, "vitest.config.js"), `import { defineConfig } from "vitest/config";
import RequireSelectedTests from ${JSON.stringify(reporterPath)};
export default defineConfig({
  cacheDir: ${JSON.stringify(cacheDir)},
  test: {
    include: ["probe.test.js"],
    allowOnly: false,
    passWithNoTests: false,
    reporters: ["default", new RequireSelectedTests()],
    coverage: { enabled: false },
    watch: false,
  },
});
`);
  if (source) writeFileSync(path.join(dir, "probe.test.js"), source);
  const run = spawnSync("bun", [vitestBin, "run", "--config", path.join(dir, "vitest.config.js")], {
    cwd: dir,
    encoding: "utf8",
    timeout: 20_000,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: dir,
    },
  });
  return { ...run, cacheDir, output: `${run.stdout ?? ""}${run.stderr ?? ""}` };
}

it("rejects skip, focus, and empty runs after a real healthy fixture passes", { timeout: 90_000 }, () => {
  const sharedBefore = newestMtime(sharedViteCache);
  const healthy = runFixture(`import { expect, it } from "vitest";
it("runs", () => { expect(1).toBe(1); });
`);
  expect(healthy.status, healthy.output).toBe(0);
  expect(healthy.output).toMatch(/1 passed/);
  expect(readdirSync(healthy.cacheDir).length).toBeGreaterThan(0);
  expect(newestMtime(sharedViteCache)).toBe(sharedBefore);

  const skipped = runFixture(`import { expect, it } from "vitest";
it("runs", () => { expect(1).toBe(1); });
it.skip("silent skip", () => { expect(1).toBe(2); });
`);
  expect(skipped.status, skipped.output).not.toBe(0);
  expect(skipped.output).toMatch(/skipped/);

  const focused = runFixture(`import { expect, it } from "vitest";
it.only("focused", () => { expect(1).toBe(1); });
`);
  expect(focused.status, focused.output).not.toBe(0);
  expect(focused.output).toMatch(/only/i);

  const empty = runFixture();
  expect(empty.status, empty.output).not.toBe(0);
  expect(empty.output).toMatch(/no test files found|empty/i);
});
