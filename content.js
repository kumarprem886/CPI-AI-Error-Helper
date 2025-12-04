// =====================================================
// Floating AI Assistant Panel (Draggable)
// =====================================================
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

// Draggable panel
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

// =====================================================
// AI Provider Calls
// =====================================================
async function callGemini(errorText, apiKey) {
  const prompt = "You are an SAP CPI expert. Analyze the following CPI error and suggest root cause, fix steps, and parameters to check:\n\n" + errorText;

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
  return parts.map(p => p.text || "").join("\n").trim();
}

async function callOpenAI(errorText, apiKey) {
  const prompt = "You are an SAP CPI expert. Explain root cause, fixes, and config items to check:\n\n" + errorText;

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

async function callAI(errorText, provider, apiKey) {
  if (provider === "gemini") return callGemini(errorText, apiKey);
  if (provider === "openai") return callOpenAI(errorText, apiKey);
  throw new Error("Unknown provider");
}

// =====================================================
// Attach AI button inside CPI error blocks
// =====================================================
function attachButton(el) {
  if (el.dataset.aiHelperAttached === "true") return;

  const btn = document.createElement("button");
  btn.innerText = "Explain Error (AI)";
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

    chrome.storage.local.get(["aiProvider", "apiKey"], async ({ aiProvider, apiKey }) => {
      const provider = aiProvider || "gemini";
      if (!apiKey) return showAiPanel(`No API key set for ${provider}. Configure in Options.`);

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

// =====================================================
// Scan CPI Page for Errors & auto-attach button
// =====================================================
function scanForErrors() {
  // Find header by fuzzy matching, span or div
  const errorHeader = Array.from(document.querySelectorAll("span, div"))
    .find(el => el.textContent.trim().toLowerCase() === "error details");

  if (!errorHeader) return;

  // Try multiple known selectors for body text
  const selectors = [
    "span.itopweb-artifact-message span.sapMTextLineClamp",   // deployment errors
    "span.itopweb-monospaced-font span.sapMTextLineClamp",    // runtime (message) errors
    "span.sapMTextLineClamp",                                 // fallback
    "span.sapMText",                                          
    "pre"                                                     // raw logs
  ];

  let logSpan = null;
  for (const sel of selectors) {
    logSpan = errorHeader.closest("div")?.parentElement?.parentElement?.querySelector(sel)
         || errorHeader.closest("div.sapUiVlt")?.querySelector(sel);
    if (logSpan) break;
  }

  if (!logSpan) return;

  const text = logSpan.innerText.trim();
  if (text.length < 10) return;

  if (!logSpan.dataset.aiAttached) attachButton(logSpan);
}




// =====================================================
// Enable scanning when hostname matches wildcard or substring patterns
// =====================================================
function wildcardMatch(hostname, pattern) {
  // Simple substring mode if no wildcard present
  if (!pattern.includes("*")) {
    return hostname.includes(pattern);
  }

  // Convert wildcard to correct regex without forcing start anchor
  const escaped = pattern
    .replace(/\./g, "\\.")   // escape dots
    .replace(/\*/g, ".*");   // convert *

  const regex = new RegExp(escaped + "$", "i"); // enforce end anchor only
  return regex.test(hostname);
}

chrome.storage.local.get(["tenantDomains"], ({ tenantDomains }) => {
  if (!tenantDomains) return;

  const hostname = window.location.hostname;
  const patterns = tenantDomains.split(",").map(v => v.trim()).filter(Boolean);

  for (const p of patterns) {
    if (wildcardMatch(hostname, p)) {
      console.log(`✔ Match: "${hostname}" against pattern "${p}"`);
      setInterval(scanForErrors, 2500);
      return;
    }
  }

  console.log(`❌ No match for hostname "${hostname}"`);
});




