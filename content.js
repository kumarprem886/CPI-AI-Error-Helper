// ============================
// Floating AI Assistant for CPI
// ============================

// Movable floating AI panel
function showAiPanel(text) {
  let panel = document.getElementById("cpi-ai-floating-pane");

  if (!panel) {
    panel = document.createElement("div");
    panel.id = "cpi-ai-floating-pane";
    panel.style.cssText = `
      position: fixed;
      top: 120px;
      right: 40px;
      width: 380px;
      height: 260px;
      background: #1c1f24;
      color: #e0e0e0;
      border: 1px solid #0070f2;
      border-radius: 10px;
      z-index: 999999;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      font-family: Arial, sans-serif;
      display: flex;
      flex-direction: column;
      resize: both;
      overflow: hidden;
    `;

    const header = document.createElement("div");
    header.style.cssText = `
      background: #0070f2;
      padding: 8px;
      font-size: 14px;
      font-weight: bold;
      cursor: move;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-radius: 10px 10px 0 0;
    `;
    header.innerHTML = `CPI AI Assistant`;

    const close = document.createElement("button");
    close.textContent = "✕";
    close.style.cssText = `
      background: transparent;
      border: none;
      color: white;
      font-size: 16px;
      cursor: pointer;
      margin-left: 10px;
    `;
    close.onclick = () => panel.remove();
    header.appendChild(close);

    const content = document.createElement("div");
    content.id = "cpi-ai-floating-content";
    content.style.cssText = `
      flex: 1;
      padding: 10px;
      overflow-y: auto;
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
    `;

    panel.appendChild(header);
    panel.appendChild(content);
    document.body.appendChild(panel);
    makeDraggable(panel, header);
  }

  document.getElementById("cpi-ai-floating-content").innerText = text;
}

// Drag panel
function makeDraggable(element, handle) {
  let offsetX = 0, offsetY = 0, startX = 0, startY = 0;

  handle.onmousedown = (e) => {
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;

    document.onmousemove = dragMove;
    document.onmouseup = stopDrag;
  };

  function dragMove(e) {
    offsetX = e.clientX - startX;
    offsetY = e.clientY - startY;
    startX = e.clientX;
    startY = e.clientY;

    element.style.top = (element.offsetTop + offsetY) + "px";
    element.style.left = (element.offsetLeft + offsetX) + "px";
  }

  function stopDrag() {
    document.onmousemove = null;
    document.onmouseup = null;
  }
}

// ============================
// AI Providers
// ============================

// Gemini Call
async function callGemini(errorText, apiKey) {
  const prompt =
    "You are an SAP CPI integration expert. Analyze this error and provide root cause, fix steps and config items to check.\n\n" +
    errorText;

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
      encodeURIComponent(apiKey),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    }
  );

  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || "").join("\n").trim();
}

// OpenAI Call
async function callOpenAI(errorText, apiKey) {
  const prompt =
    "You are an SAP CPI expert. Analyze the following CPI error and respond only with ROOT CAUSE, FIX STEPS, and PARAMETERS TO CHECK:\n\n" +
    errorText;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "No response returned.";
}

// AI dispatcher
async function callAI(errorText, provider, apiKey) {
  if (provider === "gemini") return callGemini(errorText, apiKey);
  if (provider === "openai") return callOpenAI(errorText, apiKey);
  throw new Error("Unknown AI provider: " + provider);
}

// ============================
// Attach Buttons to CPI Error Logs
// ============================
function attachButton(el) {
  if (el.dataset.aiHelperAttached === "true") return;

  const btn = document.createElement("button");
  btn.innerText = "Explain Error (AI)";
  btn.className = "ai-help-btn";
  btn.style.cssText = `
    background-color: #4c8bf5;
    color: #fff;
    border: none;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
    margin-left: 8px;
    transition: 0.2s ease;
  `;

  btn.addEventListener("click", () => {
    const errorText = el.innerText.trim();
    if (!errorText) return showAiPanel("Unable to read error text.");

    chrome.storage.sync.get(["aiProvider", "apiKey"], async ({ aiProvider, apiKey }) => {
      const provider = aiProvider || "gemini";

      if (!apiKey) {
        return showAiPanel(
          `No API key configured for ${provider.toUpperCase()}.\nGo to Extension Options to set one.`
        );
      }

      showAiPanel(`Analyzing with ${provider.toUpperCase()}...`);

      try {
        const result = await callAI(errorText, provider, apiKey);
        showAiPanel(result);
      } catch (err) {
        showAiPanel("AI Error:\n" + err.message);
      }
    });
  });

  el.appendChild(btn);
  el.dataset.aiHelperAttached = "true";
}

// ============================
// Scan CPI page for error text
// ============================
function scanForErrors() {
  const errorHeader = Array.from(document.querySelectorAll("span"))
    .find((el) => el.textContent.trim() === "Error Details");

  if (!errorHeader) return;

  let logSpan =
    errorHeader.closest("div.sapMFlexBox")?.parentElement?.parentElement
      ?.querySelector("span.itopweb-artifact-message span.sapMTextLineClamp");

  if (!logSpan) {
    logSpan = errorHeader.closest("div.sapUiVlt")?.querySelector("span.sapMTextLineClamp");
  }

  if (!logSpan) return;

  const txt = logSpan.innerText.trim();
  if (txt.length < 15) return;

  if (!logSpan.dataset.aiAttached) attachButton(logSpan);
}

// ============================
// Enable scanning if domain matches
// ============================
chrome.storage.sync.get(["cpiDomain"], ({ cpiDomain }) => {
  if (!cpiDomain) return;
  if (window.location.href.includes(cpiDomain)) {
    console.log("CPI AI Helper Active on:", cpiDomain);
    setInterval(scanForErrors, 3000);
  } else {
    console.log("CPI AI Helper: Domain mismatch, scanning disabled.");
  }
});
