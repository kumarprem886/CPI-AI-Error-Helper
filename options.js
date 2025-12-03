document.addEventListener("DOMContentLoaded", () => {
  const domainInput   = document.getElementById("cpiDomain");
  const providerSelect = document.getElementById("aiProvider");
  const apiKeyInput   = document.getElementById("apiKey");
  const apiKeyLabel   = document.getElementById("apiKeyLabel");
  const saveBtn       = document.getElementById("saveBtn");
  const status        = document.getElementById("status");

  function updateApiKeyLabel() {
    if (providerSelect.value === "gemini") {
      apiKeyLabel.textContent = "Gemini API Key";
      apiKeyInput.placeholder = "Enter Gemini API Key";
    } else if (providerSelect.value === "openai") {
      apiKeyLabel.textContent = "OpenAI API Key";
      apiKeyInput.placeholder = "Enter OpenAI API Key";
    }
  }

  // Load existing settings
  chrome.storage.sync.get(
    ["cpiDomain", "aiProvider", "apiKey"],
    (result) => {
      if (result.cpiDomain)  domainInput.value = result.cpiDomain;
      if (result.aiProvider) providerSelect.value = result.aiProvider;
      if (result.apiKey)     apiKeyInput.value = result.apiKey;
      updateApiKeyLabel();
    }
  );

  providerSelect.addEventListener("change", updateApiKeyLabel);

  // Save settings
  saveBtn.addEventListener("click", () => {
    const cpiDomain  = domainInput.value.trim();
    const aiProvider = providerSelect.value;
    const apiKey     = apiKeyInput.value.trim();

    chrome.storage.sync.set(
      { cpiDomain, aiProvider, apiKey },
      () => {
        status.textContent = "Saved!";
        setTimeout(() => { status.textContent = ""; }, 2000);
      }
    );
  });
});
