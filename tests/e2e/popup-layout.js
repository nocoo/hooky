const fs = require("node:fs/promises");
const path = require("node:path");

async function runPopupLayoutScenarios({ browser, extensionId, assert }) {
  const page = await browser.newPage();
  const url = `chrome-extension://${extensionId}/src/popup/popup.html`;
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const screenshot = async (name) => {
    await page.evaluate(async () => {
      await Promise.allSettled(document.getAnimations().filter((animation) => animation.effect.getTiming().iterations !== Infinity).map((animation) => animation.finished));
    });
    await (await page.$(".container")).screenshot({ path: path.resolve(`dist/verification/popup-${name}.png`) });
  };
  const visibleFlow = () => page.evaluate(() => {
    const button = document.getElementById("send-btn").getBoundingClientRect();
    const status = document.querySelector(".result-status").getBoundingClientRect();
    return button.top >= 0 && button.bottom <= innerHeight && status.bottom <= innerHeight
      && document.documentElement.scrollHeight <= innerHeight
      && document.documentElement.scrollWidth <= innerWidth;
  });
  try {
    await page.setViewport({ width: 380, height: 540, deviceScaleFactor: 2 });
    await page.goto(url);
    await page.evaluate(async () => {
      await chrome.storage.session.clear();
      await chrome.storage.local.set({ hooky: {
        theme: "dark", activeTemplateId: "layout",
        templates: [{ id: "layout", name: "Reading list", method: "POST", url: "https://example.invalid/hook", params: [
          { key: "url", value: "https://github.com/cloudflare/agents/" },
          { key: "note", value: "cloudflare/agents: Build and deploy AI Agents on Cloudflare" },
        ] }],
      } });
    });
    await page.reload();
    await page.waitForSelector("#send-btn:not([hidden])");
    await page.evaluate(() => {
      // UI-only transport fixture: no capture can leave the isolated profile.
      chrome.runtime.sendMessage = () => new Promise((resolve) => { globalThis.finishPopupSend = resolve; });
    });
    assert(await page.$eval(".container", (el) => el.getBoundingClientRect().height < 400), "Popup: Two-parameter flow fits below 400 CSS pixels");
    assert(await visibleFlow(), "Popup: No outer scrolling for the compact flow");
    await screenshot("dark-ready");
    await page.click("#send-btn");
    assert(await page.$eval("#send-btn", (el) => el.disabled && el.getAttribute("aria-busy") === "true"), "Popup: Send has an accessible busy state");
    assert(await visibleFlow(), "Popup: Send stays visible while the request is pending");
    await screenshot("sending");
    await page.evaluate(() => globalThis.finishPopupSend({ id: "layout-result", name: "Reading list", startedAt: Date.now(), state: "success", ok: true, status: 201 }));
    await page.waitForFunction(() => !document.getElementById("send-btn").disabled);
    assert(await visibleFlow(), "Popup: Completed feedback and Send remain visible together");
    assert(await page.$eval("#toast", (el) => getComputedStyle(el).display === "none"), "Popup: Successful send has only one visible result");
    await screenshot("dark-success");
    await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
    await screenshot("light-success");

    for (const locale of await fs.readdir(path.resolve("_locales"))) {
      const messages = JSON.parse(await fs.readFile(path.resolve("_locales", locale, "messages.json"), "utf8"));
      await page.evaluate((messages) => {
        for (const element of document.querySelectorAll("[data-i18n]")) element.textContent = messages[element.dataset.i18n].message;
        document.getElementById("last-result").dataset.state = "unknown";
        document.getElementById("last-result-status").textContent = messages.requestUnconfirmed.message;
      }, messages);
      assert(await visibleFlow(), `Popup: ${locale} labels and unconfirmed feedback fit without outer scrolling`);
    }

    await page.setViewport({ width: 320, height: 400, deviceScaleFactor: 2 });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "dark";
      const row = document.querySelector(".param-item");
      for (let index = 0; index < 12; index++) {
        const copy = row.cloneNode(true);
        copy.querySelector(".param-key").textContent = "long_parameter_" + index;
        copy.querySelector("textarea").value = "Long captured content\n".repeat(20);
        document.getElementById("params-preview").append(copy);
      }
      document.querySelector(".popup-preview").open = true;
      document.getElementById("result-details").open = true;
      document.getElementById("last-response").hidden = false;
      document.getElementById("last-response").open = true;
      document.getElementById("response-body").textContent = "Large receipt\n".repeat(200);
      document.querySelector(".editor-scroll").scrollTop = 99999;
    });
    assert(await visibleFlow(), "Popup: Many long parameters and expanded receipts never push Send offscreen at 320 x 400");
    assert(await page.$eval(".editor-scroll", (el) => el.scrollHeight > el.clientHeight && el.scrollTop > 0), "Popup: Only the editor scrolls for long captures");
    await screenshot("narrow-expanded");
    await page.click("#send-btn");
    await page.evaluate(() => globalThis.finishPopupSend({ id: "layout-error", name: "Reading list", startedAt: Date.now(), state: "failed", ok: false, status: 503 }));
    await page.waitForFunction(() => !document.getElementById("send-btn").disabled);
    assert(await visibleFlow(), "Popup: Failed send remains visible after scrolling the editor");
    assert(await page.$eval("#last-result", (el) => el.dataset.state === "failed"), "Popup: Failure uses an explicit error state");
    await screenshot("narrow-error");
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await page.click("#send-btn");
    assert(await page.$eval(".sending-icon", (el) => getComputedStyle(el).animationName === "none"), "Popup: Reduced motion disables the spinner animation");
    await page.evaluate(() => globalThis.finishPopupSend({ ok: false, error: "Transport unavailable" }));
    await page.waitForFunction(() => !document.getElementById("send-btn").disabled);
    assert(await page.$eval("#toast", (el) => el.classList.contains("error") && getComputedStyle(el).display !== "none"), "Popup: Transport failures remain visible without a stored result");
    assert(errors.length === 0, "Popup: Layout and state scenarios have no browser errors");
  } finally {
    await page.close();
  }
}

module.exports = { runPopupLayoutScenarios };
