const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const output = path.join(__dirname, "verification");
  const errors = [];
  const network = [];
  const checks = [];
  try {
    await fs.mkdir(output, { recursive: true });
    const page = await browser.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("request", (request) => { if (/^https?:/.test(request.url())) network.push(request.url()); });
    await page.setViewport({ width: 1440, height: 1080, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(path.join(__dirname, "index.html")).href);
    await page.waitForFunction(() => document.querySelectorAll("iframe").length === 24 && [...document.querySelectorAll(".measurement")].every((el) => el.textContent.includes("×")));
    assert.equal(await page.$$eval(".scenario", (elements) => elements.length), 12);
    assert.equal(await page.$eval("body", (el) => el.scrollWidth <= innerWidth), true);
    checks.push("Twelve before/after scenarios load at actual size without page overflow");

    const proposal = async (scenario) => (await page.$(`#${scenario} .proposal iframe`)).contentFrame();
    for (const scenario of ["empty", "ready", "sending", "success", "accepted", "failed", "unknown", "duplicate", "receipt", "long", "invalid", "load-error"]) {
      const frame = await proposal(scenario);
      assert.equal(await frame.$eval(".brand", (el) => el.textContent === "Hooky" && el.querySelector("img").naturalWidth > 0), true, scenario + " identity");
      assert.equal(await frame.$eval(".popup", (el) => el.getBoundingClientRect().height <= 480), true, scenario + " cap");
      assert.equal(await frame.$eval(".primary", (el) => getComputedStyle(el).fontSize), "12px", scenario + " button type");
      assert.equal(await frame.$eval(".primary", (el) => el.getBoundingClientRect().bottom <= innerHeight + 1), true, scenario + " action visible");
    }
    checks.push("All proposals retain identity, 12px actions and visible primary controls within 480px");

    const empty = await proposal("empty");
    assert.equal(await empty.$("footer"), null);
    assert.equal(await empty.$eval(".popup", (el) => el.getBoundingClientRect().height < 260), true);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, "00-review-top.png") });
    await (await page.$("#empty")).screenshot({ path: path.join(output, "01-empty-comparison.png") });
    checks.push("Branded empty task has no footer and stays below 260px");

    const ready = await proposal("ready");
    await ready.$eval('[data-field="note"]', (el) => { el.value = "Edited locally\n{{page.title}}"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    await ready.click(".request-details > summary");
    assert.equal(await ready.$eval("[data-request]", (el) => el.textContent.includes("Edited locally")), true);
    await ready.click(".request-details > summary");
    await ready.select("#template", "Team inbox");
    await ready.click('[data-action="send"]');
    assert.equal(await ready.$eval(".primary", (el) => el.disabled && el.getAttribute("aria-busy") === "true"), true);
    await ready.waitForFunction(() => document.querySelector(".popup").dataset.state === "success");
    assert.equal(await ready.$eval(".feedback", (el) => el.textContent.includes("Team inbox") && el.textContent.includes("HTTP 201")), true);
    checks.push("Editing, template switching and simulated sending work without a request");

    const repeat = await proposal("duplicate");
    await repeat.click(".request-details > summary");
    await repeat.waitForFunction(() => document.querySelector(".primary").getBoundingClientRect().bottom <= innerHeight + 1);
    assert.equal(await repeat.$eval(".primary", (el) => el.getBoundingClientRect().bottom <= innerHeight + 1), true);
    assert.equal(await repeat.$eval("[data-request]", (el) => el.textContent.includes("••••")), true);
    const long = await proposal("long");
    assert.equal(await long.$eval(".editor", (el) => el.scrollHeight > el.clientHeight), true);
    await long.$eval(".editor", (el) => { el.scrollTop = el.scrollHeight; });
    assert.equal(await long.$eval(".primary", (el) => el.getBoundingClientRect().bottom <= innerHeight + 1), true);
    checks.push("Repeat details stay masked and long captures scroll independently of Send");
    await (await page.$("#unknown")).screenshot({ path: path.join(output, "02-unconfirmed-comparison.png") });

    await page.click('[data-theme-choice="light"]');
    for (const frame of page.frames().filter((frame) => frame !== page.mainFrame())) {
      await frame.waitForFunction(() => document.documentElement.dataset.theme === "light", { polling: 100 });
    }
    await (await page.$("#empty")).screenshot({ path: path.join(output, "03-empty-light.png") });
    await page.click('[data-view-choice="proposal"]');
    assert.equal(await page.$eval(".baseline", (el) => getComputedStyle(el).display), "none");
    const boardHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewport({ width: 1440, height: boardHeight, deviceScaleFactor: 1 });
    await page.evaluate(() => scrollTo(0, 0));
    for (const frame of page.frames().filter((frame) => !frame.url().includes("/baseline/"))) await frame.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: path.join(output, "04-proposal-grid.png"), fullPage: true });
    checks.push("Theme and proposal-only review controls work");

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.evaluate(() => scrollTo(0, 0));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, "05-mobile-review.png") });
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    const pending = await proposal("sending");
    assert.equal(await pending.$eval(".spin", (el) => getComputedStyle(el).animationName), "none");
    checks.push("Mobile shell contains 380px previews without document overflow; reduced motion is honored");
    assert.deepEqual(network, [], "No external network requests");
    assert.deepEqual(errors, [], "No browser errors");
    await fs.writeFile(path.join(output, "checks.json"), JSON.stringify({ browser: await browser.version(), checks, network, errors }, null, 2) + "\n");
    console.log(`PASS: ${checks.length} static review checks; no network requests or browser errors`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
