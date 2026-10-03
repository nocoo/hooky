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
    assert(await page.$eval('#settings-btn [data-lucide="settings"]', (el) => getComputedStyle(el).strokeWidth === "2px" && el.getAttribute("viewBox") === "0 0 24 24"), "Popup: Official Lucide gear retains its viewBox and 2px stroke");
    await screenshot("dark-ready");
    await page.click("#send-btn");
    assert(await page.$eval("#send-btn", (el) => el.disabled && el.getAttribute("aria-busy") === "true"), "Popup: Send has an accessible busy state");
    assert(await visibleFlow(), "Popup: Send stays visible while the request is pending");
    await screenshot("sending");
    await page.evaluate(() => globalThis.finishPopupSend({ id: "layout-result", name: "Reading list", startedAt: Date.now(), state: "success", ok: true, status: 201 }));
    await page.waitForFunction(() => !document.getElementById("send-btn").disabled);
    assert(await visibleFlow(), "Popup: Completed feedback and Send remain visible together");
    assert(await page.$eval("#toast", (el) => getComputedStyle(el).display === "none"), "Popup: Successful send has only one visible result");
    assert(await page.$$eval(".result-icons svg", (icons) => icons.filter((el) => getComputedStyle(el).display !== "none").map((el) => el.dataset.lucide).join() === "circle-check"), "Popup: Success displays one complete Lucide icon rather than stacked paths");
    await screenshot("dark-success");
    await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
    await screenshot("light-success");

    for (const locale of await fs.readdir(path.resolve("_locales"))) {
      const messages = JSON.parse(await fs.readFile(path.resolve("_locales", locale, "messages.json"), "utf8"));
      await page.evaluate((messages) => {
        for (const element of document.querySelectorAll("[data-i18n]")) element.textContent = messages[element.dataset.i18n].message;
        document.getElementById("last-result").dataset.state = "unknown";
        document.getElementById("last-result").dataset.tone = "warning";
        document.getElementById("last-result-status").textContent = messages.requestUnconfirmed.message;
      }, messages);
      assert(await visibleFlow(), `Popup: ${locale} labels and unconfirmed feedback fit without outer scrolling`);
      await page.evaluate(() => {
        document.querySelector(".container").dataset.view = "empty";
        document.getElementById("webhook-panel").style.display = "none";
        document.getElementById("no-config").style.display = "block";
        document.getElementById("send-btn").hidden = true;
        document.getElementById("go-settings").hidden = false;
        document.getElementById("last-result").hidden = true;
      });
      assert(await page.evaluate(() => {
        const button = document.getElementById("go-settings").getBoundingClientRect();
        return getComputedStyle(document.querySelector(".feedback-slot")).display === "none"
          && document.querySelector(".container").getBoundingClientRect().height <= 240
          && button.bottom <= innerHeight && document.documentElement.scrollWidth <= innerWidth;
      }), `Popup: ${locale} setup retains its footer action without blank feedback space`);
      await page.evaluate(() => {
        document.querySelector(".container").dataset.view = "ready";
        document.getElementById("webhook-panel").style.display = "block";
        document.getElementById("no-config").style.display = "none";
        document.getElementById("send-btn").hidden = false;
        document.getElementById("go-settings").hidden = true;
        document.getElementById("last-result").hidden = false;
      });
    }

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
      document.getElementById("response-body").textContent = "Large receipt\n".repeat(200);
      document.querySelector(".editor-scroll").scrollTop = 99999;
    });
    assert(await visibleFlow(), "Popup: Many long parameters and expanded receipts never push Send offscreen at 380 x 540");
    assert(await page.$eval(".editor-scroll", (el) => el.scrollHeight > el.clientHeight && el.scrollTop > 0), "Popup: Only the editor scrolls for long captures");
    await screenshot("expanded");
    await page.click("#send-btn");
    await page.evaluate(() => globalThis.finishPopupSend({ id: "layout-error", name: "Reading list", startedAt: Date.now(), state: "failed", ok: false, status: 503 }));
    await page.waitForFunction(() => !document.getElementById("send-btn").disabled);
    assert(await visibleFlow(), "Popup: Failed send remains visible after scrolling the editor");
    assert(await page.$eval("#last-result", (el) => el.dataset.state === "failed"), "Popup: Failure uses an explicit error state");
    await screenshot("error");
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await page.click("#send-btn");
    assert(await page.$eval(".sending-icon", (el) => getComputedStyle(el).animationName === "none"), "Popup: Reduced motion disables the spinner animation");
    await page.evaluate(() => globalThis.finishPopupSend({ ok: false, error: "Transport unavailable" }));
    await page.waitForFunction(() => !document.getElementById("send-btn").disabled);
    assert(await page.$eval("#toast", (el) => el.classList.contains("error") && getComputedStyle(el).display !== "none"), "Popup: Transport failures remain visible without a stored result");
    await screenshot("transport-error");

    await page.evaluate(async () => {
      await chrome.storage.session.set({ hookyLastResult: { id: "old-success", name: "Earlier send", state: "success", ok: true, status: 201, startedAt: 10 } });
    });
    await page.reload();
    await page.waitForSelector("#send-btn:not([hidden])");
    assert(await page.$eval("#last-result", (el) => el.hidden), "Popup: Reopening a fresh capture hides the previous HTTP 201");
    await page.evaluate(async () => {
      await chrome.storage.session.set({ hookyLastResult: { id: "other-send", name: "Another tab", state: "success", ok: true, status: 201, startedAt: 20 } });
    });
    assert(await page.$eval("#last-result", (el) => el.hidden), "Popup: Other sends do not populate a fresh capture footer");
    await page.goto(url + "?view=last");
    await page.waitForFunction(() => document.getElementById("last-result-id").textContent === "other-send");
    assert(await page.$eval("#last-result", (el) => !el.hidden), "Popup: Explicit result viewing retains access to session history");
    await page.goto(url);

    const failureInjection = await page.evaluateOnNewDocument(() => {
      chrome.storage.local.get = async () => { throw new Error("private diagnostic"); };
    });
    await page.reload();
    await page.waitForFunction(() => document.querySelector(".container").dataset.view === "error");
    assert(await page.evaluate(() => !document.getElementById("retry-load").hidden && document.getElementById("send-btn").hidden && !document.body.textContent.includes("private diagnostic")), "Popup: Loading failure keeps only the footer recovery action without technical data");
    assert(await page.$eval("#retry-load", (el) => getComputedStyle(el).fontSize === "12px"), "Popup: Recovery action uses the shared 12px control token");
    await screenshot("startup-error");
    await page.removeScriptToEvaluateOnNewDocument(failureInjection.identifier);
    await page.reload();
    await page.waitForSelector("#send-btn:not([hidden])");
    await page.evaluate(async () => {
      const { hooky } = await chrome.storage.local.get("hooky");
      hooky.templates[0].url = "ftp://example.invalid";
      await chrome.storage.local.set({ hooky });
    });
    await page.reload();
    await page.waitForSelector("#edit-template:not([hidden])");
    assert(await page.evaluate(() => document.getElementById("send-btn").hidden && !document.getElementById("validation-error").hidden && !!document.getElementById("edit-template").closest("footer")), "Popup: Invalid template blocks Send and offers a footer edit action");
    await screenshot("invalid-template");
    assert(errors.length === 0, "Popup: Layout and state scenarios have no browser errors");
    await page.goto(`chrome-extension://${extensionId}/src/options/options.html`);
    for (const count of [2, 20, 0]) {
      await page.evaluate(async (count) => {
        await chrome.storage.session.clear();
        await chrome.storage.session.set({ hookyLastResult: { id: "prior", name: "Prior send", state: "success", ok: true, status: 201, startedAt: 10 } });
        await chrome.storage.local.set({ hooky: {
          theme: "dark", templates: count ? [{ id: "native", name: "Reading list", method: "POST", url: "https://example.invalid/hook", params: Array.from({ length: count }, (_, index) => ({ key: "note" + index, value: "Captured page title and content" })) }] : [],
        } });
        const opened = await chrome.runtime.sendMessage({ type: "OPEN_PANEL" });
        if (!opened.ok) throw new Error("Native popup did not open");
      }, count);
      const target = await browser.waitForTarget((target) => target.url() === url);
      const popup = await target.asPage();
      try {
        await popup.waitForFunction((count) => count ? !document.getElementById("send-btn").hidden : document.getElementById("no-config").style.display === "block", {}, count);
        await popup.waitForFunction(() => innerWidth === 380 && innerHeight >= 160 && innerHeight <= 480);
        const sizes = await popup.evaluate(() => ({ width: innerWidth, height: innerHeight }));
        assert(sizes.width === 380, `Native popup: ${count} parameters open at 380px without viewport emulation`);
        assert(await popup.$eval("#last-result", (el) => el.hidden), "Native popup: Ordinary opening does not display retained results");
        if (!count) {
          assert(sizes.height <= 240, "Native popup: Branded setup and footer action fit within 240px");
          assert(await popup.evaluate(() => document.querySelector(".popup-header .brand").textContent === "Hooky" && !!document.getElementById("go-settings").closest("footer") && getComputedStyle(document.querySelector(".feedback-slot")).display === "none"), "Native popup: Empty state preserves identity without blank feedback");
          assert(await popup.$eval(".task-copy", (el) => getComputedStyle(el).fontSize === "12px"), "Native popup: Setup body copy is 12px");
          await popup.evaluate(async () => { await Promise.allSettled(document.getAnimations().map((animation) => animation.finished)); });
          await popup.screenshot({ path: path.resolve("dist/verification/popup-empty-dark.png") });
          await popup.evaluate(() => { document.documentElement.dataset.theme = "light"; });
          await popup.screenshot({ path: path.resolve("dist/verification/popup-empty-light.png") });
          await page.goto("about:blank");
          const opened = browser.waitForTarget((target) => target.url() === `chrome-extension://${extensionId}/src/options/options.html`);
          await popup.click("#go-settings");
          const options = await (await opened).asPage();
          assert(!!options, "Native popup: Setup action opens settings");
          if (options.target() !== page.target()) await options.close();
        }
        if (count) {
          await popup.evaluate(() => {
            chrome.runtime.sendMessage = (message) => message.type === "GET_DUPLICATE_CAPTURE" ? Promise.resolve({ preview: "POST https://example.invalid\nAuthorization: ••••" }) : new Promise((resolve) => { globalThis.finishPopupSend = resolve; });
          });
          const visibleNativeFlow = () => popup.evaluate(() => {
            const button = document.getElementById("send-btn").getBoundingClientRect();
            const status = document.querySelector(".result-status").getBoundingClientRect();
            return button.top >= 0 && button.bottom <= innerHeight + 1 && status.bottom <= innerHeight + 1
              && document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1;
          });
          await popup.click("#send-btn");
          assert(await visibleNativeFlow(), "Native popup: Pending Send remains on screen");
          await popup.evaluate(() => globalThis.finishPopupSend({ id: "native-result", name: "Reading list", state: "success", ok: true, status: 201, startedAt: Date.now() }));
          await popup.waitForFunction(() => !document.getElementById("send-btn").disabled);
          await popup.waitForFunction(() => document.querySelector(".container").getBoundingClientRect().height <= innerHeight + 1);
          assert(await visibleNativeFlow(), "Native popup: Send and completed result fit the actual action viewport");
          await popup.click("#result-details > summary");
          if (count === 2) {
            for (const result of [
              { state: "success", ok: true, status: 202, tone: "warning" },
              { state: "failed", ok: false, status: 401, tone: "failed" },
              { state: "unknown", ok: false, error: "requestUnconfirmed", tone: "warning" },
              { state: "success", ok: true, status: 201, duplicateToken: "held", tone: "warning" },
            ]) {
              await popup.click("#send-btn");
              await popup.evaluate((result) => globalThis.finishPopupSend({ ...result, id: "native-state-" + Date.now(), name: "Reading list", startedAt: Date.now() }), result);
              await popup.waitForFunction(() => !document.getElementById("send-btn").disabled);
              await popup.waitForFunction(() => document.querySelector(".container").getBoundingClientRect().height <= innerHeight + 1);
              assert(await popup.$eval("#last-result", (el, tone) => el.dataset.tone === tone, result.tone), `Native popup: ${result.status || result.state} uses ${result.tone} feedback`);
              assert(await visibleNativeFlow(), "Native popup: Result stays visible across response outcomes");
              if (result.duplicateToken) {
                await popup.waitForFunction(() => !document.getElementById("send-anyway").disabled);
                await popup.click("#duplicate-actions summary");
                assert(await popup.$eval("#send-anyway", (el) => el.getBoundingClientRect().bottom <= innerHeight + 1), "Native popup: Repeat action stays visible with expanded capture preview");
                await popup.screenshot({ path: path.resolve("dist/verification/popup-native-duplicate.png") });
                await popup.click("#back-to-capture");
                assert(await popup.$eval("#send-btn", (el) => !el.hidden), "Native popup: Back to capture restores the editor action without resending");
              }
            }
          }
          await popup.waitForFunction(() => document.querySelector(".container").getBoundingClientRect().height <= innerHeight + 1);
          assert(await visibleNativeFlow(), "Native popup: Expanding result details grows the popup without clipping Send");
          if (count === 20) {
            const positions = await popup.evaluate(() => ({ header: document.querySelector("header").getBoundingClientRect().top, footer: document.querySelector("footer").getBoundingClientRect().top }));
            await popup.$eval(".editor-scroll", (el) => { el.scrollTop = el.scrollHeight; });
            assert(await popup.$eval(".editor-scroll", (el) => el.scrollHeight > el.clientHeight && el.scrollTop > 0), "Native popup: Long captures scroll within the content");
            assert(await popup.evaluate((positions) => document.querySelector("header").getBoundingClientRect().top === positions.header && document.querySelector("footer").getBoundingClientRect().top === positions.footer, positions), "Native popup: Header and footer do not move while content scrolls");
            assert(await visibleNativeFlow(), "Native popup: Scrolling content leaves the footer result and action visible");
          }
          await popup.click("#result-details > summary");
        }
        if (count) await popup.screenshot({ path: path.resolve(`dist/verification/popup-native-${count}.png`) });
      } finally {
        if (count && !popup.isClosed()) await popup.close();
      }
    }
  } finally {
    if (!page.isClosed()) await page.close();
  }
}

module.exports = { runPopupLayoutScenarios };
