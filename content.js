// Limit to your CPI tenant
function isCpiPage() {
  return window.location.href.includes("cfapps.eu20.hana.ondemand.com");
}

// Simple floating panel for AI output
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



// Call Gemini 2.5 Flash via REST API
async function callGemini(errorText, apiKey) {
  const prompt =
    "You are an SAP CPI integration expert. Analyze this SAP Cloud Integration error log and explain:\n" +
    "1) Likely root cause\n" +
    "2) Concrete fix steps inside CPI (adapter, credentials, mapping, script, etc.)\n" +
    "3) Any config objects to check (security material, integration flow, runtime).\n\n" +
    "Error log:\n" +
    errorText;

  const body = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ]
  };

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
    encodeURIComponent(apiKey);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error("HTTP " + res.status + " from Gemini: " + txt);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || "").join("\n").trim() || "No explanation returned.";
}

// Attach the button to a DOM element containing an error message
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
	btn.onmouseover = () => btn.style.backgroundColor = "#1a73e8";
	btn.onmouseout = () => btn.style.backgroundColor = "#4c8bf5";


  btn.addEventListener("click", () => {
    const errorText = el.innerText.trim();
    if (!errorText) {
      showAiPanel("Could not read error text.");
      return;
    }

    showAiPanel("Analyzing error with Gemini...");

    chrome.storage.local.get(["geminiApiKey"], async (result) => {
      const apiKey = result.geminiApiKey;
      if (!apiKey) {
        showAiPanel(
          "Gemini API key is not set.\n\nRight-click the extension icon → Options, and paste your API key."
        );
        return;
      }

      try {
        const explanation = await callGemini(errorText, apiKey);
        showAiPanel(explanation);
      } catch (e) {
        showAiPanel("Error calling Gemini:\n" + e.message);
      }
    });
  });

  el.appendChild(btn);
  el.dataset.aiHelperAttached = "true";
}

// Scan the page for likely error messages and attach buttons
function scanForErrors() {
  if (!isCpiPage()) return;

  // Find the Error Details header
  const errorHeader = Array.from(document.querySelectorAll("span"))
    .find(el => el.textContent.trim() === "Error Details");

  if (!errorHeader) return;

  // The container containing the log area (deployment errors)
  const container = errorHeader.closest("div.sapMFlexBox")?.parentElement?.parentElement;

  // Try Deployment Error Selector First (existing working logic)
  let logSpan = container?.querySelector("span.itopweb-artifact-message span.sapMTextLineClamp");

  // If not found, we are likely in message monitoring view -> use fallback selector
  if (!logSpan) {
    logSpan = errorHeader
      .closest("div.sapUiVlt")
      ?.querySelector("span.sapMTextLineClamp");
  }

  if (!logSpan) return;

  const text = (logSpan.innerText || "").trim();
  if (text.length < 15) return;

  if (!logSpan.dataset.aiAttached) {
    attachButton(logSpan);
    logSpan.dataset.aiAttached = "true";
  }
}







// CPI UI is dynamic, so poll periodically
if (isCpiPage()) {
  setInterval(scanForErrors, 3000);
}
