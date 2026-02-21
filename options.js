const prefs = [
  "blockAds",
  "blockTrackers",
  "blockSocial",
  "cosmeticFilter",
  "autoWhitelistLocal",
];

chrome.storage.local.get(
  [
    ...prefs,
    "whitelistDomains",
    "customNetworkRules",
    "customCosmeticRules",
  ],
  (data) => {
    prefs.forEach((key) => {
      const el = document.getElementById(key);
      if (el) el.checked = data[key] !== false;
    });
    if (data.whitelistDomains)
      document.getElementById("whitelistDomains").value =
        data.whitelistDomains;
    if (data.customNetworkRules)
      document.getElementById("customNetworkRules").value =
        data.customNetworkRules;
    if (data.customCosmeticRules)
      document.getElementById("customCosmeticRules").value =
        data.customCosmeticRules;
  },
);

prefs.forEach((key) => {
  document.getElementById(key)?.addEventListener("change", (e) => {
    chrome.storage.local.set({ [key]: e.target.checked });
  });
});

function makeSaveBtn(btnId, inputId, storageKey, statusId) {
  document.getElementById(btnId).addEventListener("click", () => {
    const val = document.getElementById(inputId).value;
    chrome.storage.local.set({ [storageKey]: val }, () => {
      const s = document.getElementById(statusId);
      s.style.display = "inline";
      setTimeout(() => {
        s.style.display = "none";
      }, 2000);
    });
  });
}

makeSaveBtn(
  "saveWhitelist",
  "whitelistDomains",
  "whitelistDomains",
  "wlStatus",
);
makeSaveBtn(
  "saveNetworkRules",
  "customNetworkRules",
  "customNetworkRules",
  "nrStatus",
);
makeSaveBtn(
  "saveCosmeticRules",
  "customCosmeticRules",
  "customCosmeticRules",
  "crStatus",
);

// Highlight section from hash
function handleHash() {
  const hash = window.location.hash;
  if (hash) {
    const target = document.querySelector(hash);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.style.transition = "background 0.5s";
      target.style.background = "rgba(0, 212, 255, 0.1)";
      setTimeout(() => {
        target.style.background = "";
      }, 2000);
    }
  }
}
handleHash();
window.addEventListener("hashchange", handleHash);
