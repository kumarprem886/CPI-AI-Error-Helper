document.addEventListener("DOMContentLoaded", () => {
  const domainInput     = document.getElementById("tenantDomains");
  const providerSelect  = document.getElementById("aiProvider");
  const apiKeyInput     = document.getElementById("apiKey");
  const apiKeyLabel     = document.getElementById("apiKeyLabel");
  const saveBtn         = document.getElementById("saveBtn");
  const status          = document.getElementById("status");
  const domainStatus    = document.getElementById("domainStatus");
  const testDomainBtn   = document.getElementById("testBtn");

  function updateApiKeyLabel() {
    if (providerSelect.value === "gemini") {
      apiKeyLabel.textContent = "Gemini API Key";
      apiKeyInput.placeholder = "Enter Gemini API Key";
    } else if (providerSelect.value === "openai") {
      apiKeyLabel.textContent = "OpenAI API Key";
      apiKeyInput.placeholder = "Enter OpenAI API Key";
    }
  }

  // Validate wildcard format by building a regex
  function isValidPattern(pattern) {
    try {
      new RegExp("^" + pattern.split("*").join(".*") + "$");
      return true;
    } catch (e) {
      return false;
    }
  }

  // Load saved configuration
  chrome.storage.local.get(["tenantDomains", "aiProvider", "apiKey"], (res) => {
    if (res.tenantDomains) domainInput.value = res.tenantDomains;
    if (res.aiProvider)    providerSelect.value = res.aiProvider;
    if (res.apiKey)        apiKeyInput.value = res.apiKey;
    updateApiKeyLabel();
  });

  providerSelect.addEventListener("change", updateApiKeyLabel);

  // Save settings
  saveBtn.addEventListener("click", () => {
    const rawValue = domainInput.value.trim();
    const domainList = rawValue.split(",").map(v => v.trim()).filter(Boolean);

    // Validate
    for (const domain of domainList) {
      if (!isValidPattern(domain)) {
        status.textContent = `❌ Invalid domain pattern: ${domain}`;
        status.style.color = "red";
        return;
      }
    }

    chrome.storage.local.set(
      {
        tenantDomains: domainList.join(","),
        aiProvider: providerSelect.value,
        apiKey: apiKeyInput.value.trim()
      },
      () => {
        status.textContent = "✔ Saved successfully";
        status.style.color = "green";
        setTimeout(() => (status.textContent = ""), 2000);
      }
    );
  });

  // Test pattern match against current tab hostname
  testDomainBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs || !tabs.length) return;
      const urlObj = new URL(tabs[0].url);
      const hostname = urlObj.hostname;

      const domainList = domainInput.value.split(",").map(v => v.trim()).filter(Boolean);

      for (const d of domainList) {
        const regex = new RegExp("^" + d.split("*").join(".*") + "$");
        if (regex.test(hostname)) {
          domainStatus.textContent = `✔ MATCH — "${hostname}" matches "${d}"`;
          domainStatus.style.color = "green";
          return;
        }
      }

      domainStatus.textContent = `❌ NO MATCH — "${hostname}" does not match any pattern`;
      domainStatus.style.color = "red";
    });
  });
});
