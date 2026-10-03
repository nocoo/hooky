const scenarios = [
  ["empty", "A first destination", "SETUP", "A large repeated mascot, full header and an empty dock consume the frame.", "A small logo and name establish ownership. The task, explanation and one setup action follow directly. No footer."],
  ["ready", "Ready to send", "PRIMARY FLOW", "Brand and settings sit in a separate bar; the send area reserves empty feedback space.", "Brand and settings share one quiet row. A 12px form and a 40px Send action keep the content in charge."],
  ["sending", "A request in progress", "PENDING", "The button changes while another Sending message can appear below it.", "One stable action becomes Sending. Fields lock; the status slot explains that the receiver has not replied. No fake progress."],
  ["success", "A response, not a guarantee", "HTTP 201", "A persistent result is useful, but it competes with repeated heading and metadata.", "A concise result sits beside a check icon, with HTTP evidence and receipt details on demand. Brand stays modest."],
  ["accepted", "Accepted is not completed", "HTTP 202", "The generic result layout gives acceptance almost the same weight as completion.", "An amber result explicitly says processing may continue. Never claim the remote workflow is complete."],
  ["failed", "A failure with a next step", "HTTP 401", "A red response alone does not explain what to do next.", "Retain the capture. Name the HTTP failure, suggest checking authorization, and offer settings without automatically resending."],
  ["unknown", "No response, no assumptions", "UNCONFIRMED", "Unknown results share the red error treatment, implying a definitive failure.", "Amber means uncertainty. Check the receiver before any explicit repeat; a missing response is not proof of a failed write."],
  ["duplicate", "Pause before a second send", "REPEAT GUARD", "Repeat preview and Send anyway compete with the ordinary Send action.", "The repeat becomes the current task: one warning, masked capture on demand, and one explicit Send anyway action."],
  ["receipt", "Inspect the result", "DISCLOSURE", "Multiple nested disclosures and a full editor make result inspection busy.", "Expand just the receipt. Show HTTP evidence, returned fields and send ID inside a bounded detail area; the main action stays visible."],
  ["long", "A long capture", "SCROLL BOUNDARY", "The frame is capped, but fixed chrome reduces the usable editing area.", "Only the editor scrolls. The action and feedback stay in the frame, while the identity line can scroll away with secondary content."],
  ["invalid", "Fix before sending", "VALIDATION", "An invalid destination is only visible in request preview until Send fails.", "A field-level explanation and Edit webhook replace an unusable Send. No speculative request or exposed credential."],
  ["load-error", "Recover the panel", "LOAD FAILURE", "A technical message can appear in an otherwise blank shell and footer.", "Keep a small identity and one recovery task. Retry loads the panel only; it does not resend, clear templates or leak diagnostics."],
];

const frames = [];
const board = document.getElementById("scenarios");
const jump = document.getElementById("scenario-jump");
for (const [index, [id, title, tag, before, after]] of scenarios.entries()) {
  const number = String(index + 1).padStart(2, "0");
  jump.add(new Option(`${number} / ${title}`, id));
  const section = document.createElement("section");
  section.className = "scenario";
  section.id = id;
  section.innerHTML = `<div class="scenario-title"><span class="number">${number}</span><h2>${title}</h2><span class="state-tag">${tag}</span></div><div class="comparison"></div><div class="notes"><p>${before}</p><p>${after}</p></div>`;
  for (const variant of ["baseline", "proposal"]) {
    const card = document.createElement("div");
    card.className = `preview-card ${variant}`;
    card.innerHTML = `<div class="preview-stage"></div><div class="preview-meta"><span>${variant === "baseline" ? "Baseline / reconstructed from 7a0dfbe" : "Proposal / simulated interactions"}</span><span class="measurement">380px</span></div>`;
    const frame = document.createElement("iframe");
    frame.title = `${variant} / ${title}`;
    frame.height = "380";
    frame.src = `${variant === "baseline" ? "baseline/index.html" : "proposal.html"}?state=${id}&theme=${document.documentElement.dataset.theme}`;
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    card.querySelector(".preview-stage").append(frame);
    section.querySelector(".comparison").append(card);
    frames.push(frame);
  }
  board.append(section);
}

window.addEventListener("message", (event) => {
  const frame = frames.find((item) => item.contentWindow === event.source);
  if (!frame || event.data?.type !== "hooky-review-size") return;
  const height = Math.max(80, Math.min(800, Number(event.data.height)));
  if (!Number.isFinite(height)) return;
  frame.height = String(height);
  frame.closest(".preview-card").querySelector(".measurement").textContent = `380 × ${height}px`;
});

jump.addEventListener("change", () => document.getElementById(jump.value).scrollIntoView({ block: "start" }));
for (const button of document.querySelectorAll("[data-theme-choice]")) {
  button.addEventListener("click", () => {
    document.documentElement.dataset.theme = button.dataset.themeChoice;
    for (const item of document.querySelectorAll("[data-theme-choice]")) item.setAttribute("aria-pressed", String(item === button));
    for (const frame of frames) frame.contentWindow.postMessage({ type: "hooky-review-theme", theme: button.dataset.themeChoice }, "*");
  });
}
for (const button of document.querySelectorAll("[data-view-choice]")) {
  button.addEventListener("click", () => {
    document.documentElement.dataset.view = button.dataset.viewChoice;
    for (const item of document.querySelectorAll("[data-view-choice]")) item.setAttribute("aria-pressed", String(item === button));
  });
}
