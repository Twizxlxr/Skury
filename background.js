// === Skury Background Service Worker ===

// Helper: detect likely multiple-choice questions in text
function isLikelyMCQ(text) {
  try {
    if (!text || typeof text !== 'string') return false;
    // Support options A-H to cover extended sets
    const optionPattern = /(^|\s)[(\[]?[A-H][)\].: -]/ig;
    const matches = text.match(optionPattern);
    return !!(matches && matches.length >= 2);
  } catch { return false; }
}

// Helper: extract a single letter A-H from a model reply
function extractMCQLetter(text) {
  if (!text) return null;
  const m = text.match(/\b([A-H])\b/i) || text.match(/(?:^|\s)([A-H])(?=\s|\.|,|$)/i);
  return m ? m[1].toUpperCase() : null;
}


// Initialize with default settings when installed
chrome.runtime.onInstalled.addListener(() => {
  console.log('Skury installed/updated');
  console.log(`
    To set your Gemini API key, open DevTools and run:
    await chrome.storage.local.set({ geminiApiKey: 'your-api-key-here' })

    To check your current API key:
    await chrome.storage.local.get(['geminiApiKey'])
  `);
  // We no longer use chrome.sidePanel; both the icon and bubble toggle the in-page panel via content.js
});

// Keep-alive port: accept connections from popup/side panel so the service worker
// stays awake while the UI is open. Also reply to pings to avoid immediate disconnect.
chrome.runtime.onConnect.addListener((port) => {
  if (port?.name !== 'skury-keepalive') return;
  console.log('background: keepalive port connected');

  const onMessage = (msg) => {
    // reply to ping to indicate background is alive
    if (msg && msg.type === 'ping') {
      try { port.postMessage({ type: 'pong' }); } catch (e) { /* no-op */ }
    }
  };
  const onDisconnect = () => {
    console.log('background: keepalive port disconnected');
    try {
      port.onMessage.removeListener(onMessage);
    } catch (e) { /* ignore */ }
  };

  port.onMessage.addListener(onMessage);
  port.onDisconnect.addListener(onDisconnect);
});

// Handle toolbar icon clicks
// This ensures the side panel is enabled for the specific tab
// when the user clicks the toolbar icon.
chrome.action.onClicked.addListener(async (tab) => {
  try {
    const tabId = tab && tab.id ? tab.id : await new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs?.[0]?.id ?? null));
    });
    if (!tabId) return;
    await chrome.tabs.sendMessage(tabId, { type: 'toggleInPagePanel' });
  } catch (error) {
    console.warn('Action click send failed, attempting to inject content script...', error);
    try {
      await ensureContentInjected(tab.id, tab.url);
      await chrome.tabs.sendMessage(tab.id, { type: 'toggleInPagePanel' });
    } catch (e2) {
      console.error('Action click retry failed:', e2);
    }
  }
});

// 2. Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('background: onMessage received', request, sender && sender.tab && sender.tab.id);
  // === Unified toggle handler: always toggle the in-page right panel ===
  if (request.type === "toggleSidebar") {
    const initialTabId = sender?.tab?.id ?? null;
    (async () => {
      try {
        let tabId = initialTabId;
        if (!tabId) {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          tabId = tabs?.[0]?.id ?? null;
        }
        if (!tabId) {
          sendResponse({ success: false, error: 'No active tab to toggle panel.' });
          return;
        }
        await chrome.tabs.sendMessage(tabId, { type: 'toggleInPagePanel' });
        sendResponse({ success: true, inPage: true });
      } catch (e) {
        console.warn('toggleSidebar: content script may not be injected; attempting injection...', e);
        try {
          const tabs = await new Promise((resolve) => chrome.tabs.query({ active: true, currentWindow: true }, resolve));
          const active = tabs && tabs[0];
          if (active?.id) {
            await ensureContentInjected(active.id, active.url);
            await chrome.tabs.sendMessage(active.id, { type: 'toggleInPagePanel' });
            sendResponse({ success: true, injected: true });
          } else {
            sendResponse({ success: false, error: 'No active tab to inject.' });
          }
        } catch (e2) {
          console.warn('toggleSidebar: injection failed', e2);
          sendResponse({ success: false, error: 'Content script not available on this page.' });
        }
      }
    })().catch(err => {
      console.error('toggleSidebar unexpected error:', err);
      sendResponse({ success: false, error: err.message || 'Unknown error' });
    });
    return true;
  }
  // === END OF UPDATED BLOCK ===

  // Forward snip initiation from the extension UI to the active tab's content script
  if (request.type === 'initiateSnip') {
    (async () => {
      try {
        console.log('background: initiateSnip request received');
        let tabId = sender?.tab?.id;
        if (!tabId) {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          tabId = tabs?.[0]?.id ?? null;
        }
        if (!tabId) {
          sendResponse({ success: false, error: 'No active tab to initiate snip.' });
          return;
        }
        await chrome.tabs.sendMessage(tabId, { type: 'initiateSnip' });
        console.log('background: initiateSnip forwarded to tab', tabId);
        sendResponse({ success: true });
      } catch (e) {
        console.warn('initiateSnip: failed to forward to tab', e);
        sendResponse({ success: false, error: e.message || 'Failed to initiate snip' });
      }
    })().catch(err => {
      console.error('initiateSnip unexpected error:', err);
      sendResponse({ success: false, error: err.message || 'Unknown error' });
    });
    return true;
  }

  // Handle theme detection request from sidebar
  if (request.type === 'getPageTheme') {
    (async () => {
      try {
        let tabId = sender?.tab?.id;
        if (!tabId) {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          tabId = tabs?.[0]?.id ?? null;
        }
        if (!tabId) {
          sendResponse({ isDark: true }); // default to dark
          return;
        }
        // Forward to content script
        chrome.tabs.sendMessage(tabId, { type: 'getPageTheme' }, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ isDark: true }); // default to dark
          } else {
            sendResponse(response || { isDark: true });
          }
        });
      } catch (e) {
        sendResponse({ isDark: true }); // default to dark
      }
    })().catch(() => {
      sendResponse({ isDark: true }); // default to dark
    });
    return true;
  }

  // Handle read page request
  if (request.type === 'readPage') {
    (async () => {
      try {
        let tabId = sender?.tab?.id;
        if (!tabId) {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          tabId = tabs?.[0]?.id ?? null;
        }
        if (!tabId) {
          sendResponse({ error: 'No active tab to read.' });
          return;
        }
        // Forward to content script to extract page text
        chrome.tabs.sendMessage(tabId, { type: 'extractPageContent' }, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: 'Could not read page content. Make sure the page is loaded.' });
          } else {
            sendResponse(response || { error: 'No content received' });
          }
        });
      } catch (e) {
        sendResponse({ error: e.message || 'Failed to read page' });
      }
    })().catch(err => {
      sendResponse({ error: err.message || 'Unknown error' });
    });
    return true;
  }

  // Forward theme changes from sidebar to active tab's content script
  if (request.type === 'themeChanged') {
    (async () => {
      try {
        let tabId = sender?.tab?.id;
        if (!tabId) {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          tabId = tabs?.[0]?.id ?? null;
        }
        if (!tabId) {
          sendResponse({ success: false, error: 'No active tab to apply theme.' });
          return;
        }
        await chrome.tabs.sendMessage(tabId, { type: 'themeChanged', theme: request.theme });
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e.message || 'Failed to forward theme change' });
      }
    })().catch(err => {
      sendResponse({ success: false, error: err.message || 'Unknown error' });
    });
    return true;
  }


  // Handle Gemini API calls
  if (request.type === "callGemini") {
    const prompt = request.prompt?.toString() || "";
    const imageData = request.imageData?.toString(); // data URL or base64
    if (!prompt && !imageData) {
      sendResponse({ error: "No prompt or image provided." });
      return false;
    }

    const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

    // Execute API call in async context
    (async () => {
      try {
        // Get API key from storage
        const result = await chrome.storage.local.get(['geminiApiKey']);
        const apiKey = result.geminiApiKey;

        if (!apiKey) {
          sendResponse({ 
            error: "Please set your Gemini API key using the console command:\n" +
                  "await chrome.storage.local.set({geminiApiKey: 'YOUR-API-KEY'})" 
          });
          return;
        }

        // Style instructions to keep answers concise and MCQ letter-only
        const styleInstruction = [
          "Answering rules:",
          "- Only provide relevant information. Avoid filler.",
          "- If the task is a multiple-choice question with options (A, B, C, D), reply with ONLY the single best option letter (A/B/C/D). No explanation.",
          "- Otherwise, keep the response concise (ideally under 3 sentences)."
        ].join("\n");

        // Build multimodal parts: instruction, user text, image
        const parts = [ { text: styleInstruction } ];
        if (prompt) parts.push({ text: prompt });
        if (imageData) {
          // Accept data URL (data:mime;base64,....) or raw base64 (assume png if unknown)
          let mime = 'image/png';
          let base64 = imageData;
          if (imageData.startsWith('data:')) {
            const match = imageData.match(/^data:(.*?);base64,(.*)$/);
            if (match) {
              mime = match[1] || mime;
              base64 = match[2];
            } else {
              // fallback: split by comma
              base64 = imageData.split(',')[1] || '';
            }
          }
          // Only allow image mime types to avoid model rejection
          if (!/^image\//.test(mime)) mime = 'image/png';
          parts.push({ inline_data: { mime_type: mime, data: base64 } });
        }

        const response = await fetch(`${API_URL}?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            contents: [{ parts }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 1024,
              topP: 0.95,
              topK: 40
            }
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            `API Error (${response.status}): ${errorData.error?.message || 'Unknown error'}`
          );
        }

        const data = await response.json();
        
        if (!data.candidates || data.candidates.length === 0) {
          // Check for safety ratings
          if (data.promptFeedback && data.promptFeedback.blockReason) {
             throw new Error(`Request blocked due to: ${data.promptFeedback.blockReason}`);
          }
          throw new Error("No content returned from API.");
        }
        // Combine text parts from the first candidate
        const cand = data.candidates[0];
        const replyText = (cand.content?.parts || [])
          .map(p => p.text || "")
          .join("\n")
          .trim();

        // If input looks like MCQ, reduce to a single letter A-D
        let finalReply = replyText;
        if (isLikelyMCQ(prompt)) {
          const letter = extractMCQLetter(replyText);
          if (letter) finalReply = letter; // enforce single-letter answer
        }

        sendResponse({ reply: finalReply });

      } catch (error) {
        console.error("Failed to call Gemini API:", error);
        sendResponse({ 
          error: error.message 
        });
      }
    })().catch(err => {
      console.error("callGemini unexpected error:", err);
      sendResponse({ error: err.message || 'Unknown error' });
    });
    
    return true; // Indicates asynchronous response
  }

  // Visible tab capture fallback for snipping
  if (request.type === 'captureVisible') {
    try {
      chrome.tabs.captureVisibleTab({ format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          console.log('background: captureVisibleTab success, length=', dataUrl ? dataUrl.length : 0);
          sendResponse({ dataUrl });
        }
      });
    } catch (e) {
      sendResponse({ error: e.message });
    }
    return true;
  }
});

// Helper: attempt to inject our content script and CSS into the tab if allowed
async function ensureContentInjected(tabId, url) {
  try {
    // Skip restricted schemes
    if (!url || /^(chrome|edge|opera|about|chrome-extension):/i.test(url)) {
      throw new Error('Cannot inject into restricted pages.');
    }
    // Insert CSS then JS
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return true;
  } catch (e) {
    console.warn('ensureContentInjected failed:', e.message || e);
    throw e;
  }
}