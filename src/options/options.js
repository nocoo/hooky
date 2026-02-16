const urlInput = document.getElementById("webhook-url");
const methodSelect = document.getElementById("http-method");
const paramsList = document.getElementById("params-list");
const addParamBtn = document.getElementById("add-param");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

function createParamRow(key = "", value = "") {
  const row = document.createElement("div");
  row.className = "param-row";

  const keyInput = document.createElement("input");
  keyInput.type = "text";
  keyInput.placeholder = "Key";
  keyInput.value = key;
  keyInput.className = "param-key";

  const valueInput = document.createElement("input");
  valueInput.type = "text";
  valueInput.placeholder = "Value (e.g. {{page.url}})";
  valueInput.value = value;
  valueInput.className = "param-value";

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn-remove";
  removeBtn.textContent = "\u00d7";
  removeBtn.addEventListener("click", () => row.remove());

  row.appendChild(keyInput);
  row.appendChild(valueInput);
  row.appendChild(removeBtn);

  return row;
}

function getParams() {
  const rows = paramsList.querySelectorAll(".param-row");
  const params = [];
  for (const row of rows) {
    const key = row.querySelector(".param-key").value.trim();
    const value = row.querySelector(".param-value").value.trim();
    params.push({ key, value });
  }
  return params;
}

function showStatus(message) {
  statusEl.textContent = message;
  statusEl.classList.add("visible");
  setTimeout(() => statusEl.classList.remove("visible"), 2000);
}

async function loadConfig() {
  const data = await chrome.storage.local.get("webhook");
  const config = data.webhook;

  if (!config) return;

  urlInput.value = config.url || "";
  methodSelect.value = config.method || "POST";

  paramsList.innerHTML = "";
  if (config.params) {
    for (const { key, value } of config.params) {
      paramsList.appendChild(createParamRow(key, value));
    }
  }
}

async function saveConfig() {
  const webhook = {
    url: urlInput.value.trim(),
    method: methodSelect.value,
    params: getParams(),
  };

  await chrome.storage.local.set({ webhook });
  showStatus("Saved!");
}

addParamBtn.addEventListener("click", () => {
  paramsList.appendChild(createParamRow());
});

saveBtn.addEventListener("click", saveConfig);

loadConfig();
