document.addEventListener("DOMContentLoaded", () => {
  const apiKeyInput = document.getElementById("apiKey");
  const status = document.getElementById("status");
  const saveBtn = document.getElementById("saveBtn");

  // Load existing key
  chrome.storage.local.get(["geminiApiKey"], (result) => {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
  });

  // Save key
  saveBtn.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    chrome.storage.local.set({ geminiApiKey: key }, () => {
      status.textContent = "Saved!";
      setTimeout(() => (status.textContent = ""), 2000);
    });
  });
});
