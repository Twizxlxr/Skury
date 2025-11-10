// === Skury Floating Bubble ===

// Safe message helper to avoid 'Extension context invalidated' errors
function safeSendMessage(message, callback) {
  try {
    if (!chrome || !chrome.runtime || !chrome.runtime.id) {
      console.warn('Skury: extension context unavailable; skipping message', message && message.type);
      return;
    }
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('Skury: runtime message error:', chrome.runtime.lastError.message);
      }
      if (typeof callback === 'function') {
        try { callback(response); } catch (_) {}
      }
    });
  } catch (e) {
    console.warn('Skury: safeSendMessage failed', e);
  }
}

function applyBubbleTheme(theme) {
  const bubble = document.getElementById('aiBubble');
  if (!bubble) return;
  const normalized = (theme === 'dark' || theme === 'light') ? theme : 'dark';
  bubble.classList.remove('theme-dark', 'theme-light');
  bubble.classList.add(`theme-${normalized}`);
}

chrome.storage.local.get(['skuryTheme'], (result) => {
  applyBubbleTheme(result.skuryTheme);
});

// 1. Create floating bubble (guard against duplicates)
let bubble = document.getElementById("aiBubble");
if (!bubble) {
  bubble = document.createElement("div");
  bubble.id = "aiBubble";
  bubble.style.backgroundImage = `url(${chrome.runtime.getURL('icon.png')})`;
  bubble.style.backgroundSize = "80%";
  bubble.style.backgroundRepeat = "no-repeat";
  bubble.style.backgroundPosition = "center";
  document.body.appendChild(bubble);
} else {
  console.log('Skury: aiBubble already exists');
}

// === Variables ===
let isDragging = false;
let offsetX = 0;
let offsetY = 0;
let moved = false;

// === Drag + Click Handling ===
bubble.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return; // left click only
  isDragging = true;
  moved = false;
  bubble.style.transition = "none";

  document.body.style.userSelect = "none";

  const rect = bubble.getBoundingClientRect();
  offsetX = e.clientX - rect.left;
  offsetY = e.clientY - rect.top;
});

document.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  e.preventDefault();
  moved = true;

  const newLeft = e.clientX - offsetX;
  const newTop = e.clientY - offsetY;

  const maxX = window.innerWidth - bubble.offsetWidth - 10;
  const maxY = window.innerHeight - bubble.offsetHeight - 10;
  const clampedX = Math.min(Math.max(newLeft, 10), maxX);
  const clampedY = Math.min(Math.max(newTop, 10), maxY);

  bubble.style.left = `${clampedX}px`;
  bubble.style.top = `${clampedY}px`;
  bubble.style.right = "auto";
});

document.addEventListener("mouseup", async () => {
  if (!isDragging) return;
  isDragging = false;
  document.body.style.userSelect = "";

  if (moved) {
    // If we dragged, snap back to the side
    const currentTop = parseFloat(bubble.style.top || "50%");
    bubble.style.transition = "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)";
    bubble.style.left = "auto";
    bubble.style.right = "6px";
    bubble.style.top = `${currentTop}px`;
    localStorage.setItem("skuryBubbleY", `${currentTop}px`);
  } else {
    // If we just clicked, send a message to background.js
    console.log('aiBubble: clicked — sending toggleSidebar message');
    safeSendMessage({ type: "toggleSidebar" }, (response) => {
      console.log('aiBubble: toggleSidebar response', response);
    });
  }
});

// === Load last Y position ===
const savedY = localStorage.getItem("skuryBubbleY");
if (savedY) bubble.style.top = savedY;

// === Dynamic Bubble Color ===
function getAverageColorBrightness() {
  try {
    const bg = window.getComputedStyle(document.body).backgroundColor;
    const match = bg.match(/\d+/g);
    if (!match) return 255;
    const [r, g, b] = match.map(Number);
    return (r + g + b) / 3;
  } catch {
    return 255;
  }
}

function updateBubbleColor() {
  // Bubble now always purple to match sidebar theme
  // No need to change based on background
}

updateBubbleColor();

// === In-page side panel using Shadow DOM (no iframe) ===
let skuryPanelHost = null;

async function ensureInPagePanel() {
  const existing = document.getElementById('skuryPanelHost');
  if (existing) { skuryPanelHost = existing; return existing; }

  // Create host container
  const host = document.createElement('div');
  host.id = 'skuryPanelHost';
  Object.assign(host.style, {
    position: 'fixed',
    top: '0',
    right: '0',
    width: '400px',
    height: '100vh',
    zIndex: '2147483646',
    boxShadow: '0 0 12px rgba(0,0,0,0.5)',
    background: 'transparent',
    display: 'none'
  });

  // Attach shadow root (open for dev tools access)
  const shadow = host.attachShadow({ mode: 'open' });

  // Inject styles.css into shadow root
  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = chrome.runtime.getURL('styles.css');
  shadow.appendChild(styleLink);

  // Fetch and inject popup.html content
  const htmlText = await fetch(chrome.runtime.getURL('popup.html')).then(r => r.text());
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, 'text/html');
  const wrapper = document.createElement('div');
  wrapper.innerHTML = doc.body.innerHTML;
  shadow.appendChild(wrapper);

  // Bootstrap: scope DOM queries to the shadow root first (fallback to document)
  const bootstrap = document.createElement('script');
  bootstrap.type = 'module';
  const bootstrapCode = `
    const root = document.currentScript.getRootNode();
    const d = document;
    const ogById = d.getElementById.bind(d);
    const ogQS = d.querySelector.bind(d);
    const ogQSA = d.querySelectorAll.bind(d);
    const ogByClass = d.getElementsByClassName.bind(d);
    const ogByTag = d.getElementsByTagName.bind(d);
    const qFromRoot = (sel) => (root && root.querySelector) ? root.querySelector(sel) : null;
    const qaFromRoot = (sel) => (root && root.querySelectorAll) ? root.querySelectorAll(sel) : [];
    d.getElementById = (id) => (root && root.getElementById ? root.getElementById(id) : qFromRoot('#'+CSS.escape(id))) || ogById(id);
    d.querySelector = (sel) => qFromRoot(sel) || ogQS(sel);
    d.querySelectorAll = (sel) => {
      const list = qaFromRoot(sel);
      return (list && list.length) ? list : ogQSA(sel);
    };
    d.getElementsByClassName = (cls) => (root && root.getElementsByClassName ? root.getElementsByClassName(cls) : ogByClass(cls));
    d.getElementsByTagName = (tag) => (root && root.getElementsByTagName ? root.getElementsByTagName(tag) : ogByTag(tag));
    window.__SKURY_SHADOW_ROOT__ = root;
    // chrome.* polyfill via content-script bridge
    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) window.chrome.runtime = {};
    if (!window.chrome.storage) window.chrome.storage = { local: {} };
    const callbacks = new Map();
    window.addEventListener('message', (ev) => {
      const data = ev.data;
      if (!data || data.type !== 'SKURY_BRIDGE_RES') return;
      const cb = callbacks.get(data.id);
      if (cb) {
        callbacks.delete(data.id);
        cb(data);
      }
    });
    const request = (api, payload, cb) => {
      const id = 'skury_' + Math.random().toString(36).slice(2);
      if (cb) callbacks.set(id, cb);
      window.postMessage({ type: 'SKURY_BRIDGE_REQ', id, api, payload }, '*');
    };
    window.chrome.runtime.sendMessage = (message, callback) => {
      request('runtime.sendMessage', { message }, (res) => callback && callback(res && (res.response !== undefined ? res.response : res)));
    };
    window.chrome.storage.local.get = (keys, callback) => {
      request('storage.local.get', { keys }, (res) => callback && callback(res && res.result));
    };
    window.chrome.storage.local.set = (items, callback) => {
      request('storage.local.set', { items }, () => callback && callback());
    };
    window.chrome.runtime.connect = (_info) => {
      // no-op stub to avoid crashes; returns minimal port-like object
      return {
        onDisconnect: { addListener: () => {} },
        onMessage: { addListener: () => {} },
        postMessage: () => {},
        disconnect: () => {}
      };
    };
  `;
  const bootstrapBlob = new Blob([bootstrapCode], { type: 'module/javascript' });
  bootstrap.src = URL.createObjectURL(bootstrapBlob);
  shadow.appendChild(bootstrap);

  // Load sidebar.js and popup.js as module scripts inside shadow root
  for (const scriptName of ['sidebar.js', 'popup.js']) {
    const code = await fetch(chrome.runtime.getURL(scriptName)).then(r => r.text());
    const blob = new Blob([code], { type: 'module/javascript' });
    const url = URL.createObjectURL(blob);
    const script = document.createElement('script');
    script.type = 'module';
    script.src = url;
    shadow.appendChild(script);
  }

  // Add to page
  document.body.appendChild(host);
  skuryPanelHost = host;
  console.log('Skury: Shadow DOM sidebar initialized');

  // Apply initial theme to panel host
  try {
    chrome.storage.local.get(['skuryTheme'], (result) => {
      applyPanelTheme(result.skuryTheme);
    });
  } catch {}

  return host;
}

// Bridge: handle page-world chrome.* polyfill requests from shadow UI
window.addEventListener('message', (event) => {
  try {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.type !== 'SKURY_BRIDGE_REQ') return;
    const { id, api, payload } = data;

    const respond = (msg) => window.postMessage({ type: 'SKURY_BRIDGE_RES', id, ...msg }, '*');

    if (api === 'runtime.sendMessage') {
      chrome.runtime.sendMessage(payload && payload.message, (response) => {
        respond({ response, lastError: chrome.runtime.lastError ? chrome.runtime.lastError.message : null });
      });
      return;
    }
    if (api === 'storage.local.get') {
      chrome.storage.local.get(payload && payload.keys, (result) => respond({ result }));
      return;
    }
    if (api === 'storage.local.set') {
      chrome.storage.local.set(payload && payload.items, () => respond({ result: true }));
      return;
    }
    // No-op stubs for runtime.connect used by popup.js keepalive
    if (api === 'runtime.connect') {
      // not supported via bridge; acknowledge to avoid errors
      respond({ result: true });
      return;
    }
    respond({ error: 'Unsupported API: ' + api });
  } catch (e) {
    try { window.postMessage({ type: 'SKURY_BRIDGE_RES', id: event?.data?.id, error: String(e) }, '*'); } catch (_) {}
  }
});

// helper to detect clicks outside the panel and close it
function _onDocumentMouseDown(ev) {
  try {
    const panel = document.getElementById('skuryPanelHost');
    if (!panel || panel.style.display === 'none') return;
    if (panel.contains(ev.target)) return; // click inside panel; ignore
    toggleInPagePanel(false);
  } catch (e) { /* no-op */ }
}

async function toggleInPagePanel(forceState) {
  const panel = await ensureInPagePanel();
  const isOpen = panel.style.display !== 'none';
  const shouldOpen = typeof forceState === 'boolean' ? forceState : !isOpen;
  panel.style.display = shouldOpen ? 'block' : 'none';
}

function applyPanelTheme(theme) {
  const panel = document.getElementById('skuryPanelHost');
  if (!panel) return;
  panel.classList.remove('theme-dark', 'theme-light');
  panel.classList.add(`theme-${theme}`);
}

// Listen for Escape key to close the panel
document.addEventListener('keydown', (e) => {
  const host = document.getElementById('skuryPanelHost');
  if (e.key === 'Escape' && host && host.style.display !== 'none') {
    toggleInPagePanel(false);
  }
});

// Message handler to toggle the in-page panel
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'toggleInPagePanel') {
    toggleInPagePanel();
  }
  if (msg && msg.type === 'initiateSnip') {
    startScreenSnip();
  }
  if (msg && msg.type === 'themeChanged') {
    applyBubbleTheme(msg.theme);
    applyPanelTheme(msg.theme);
    sendResponse && sendResponse({ success: true });
    return true;
  }
  if (msg && msg.type === 'getPageTheme') {
    // Detect page background brightness and return theme
    const brightness = getAverageColorBrightness();
    sendResponse({ isDark: brightness < 128 });
    return true;
  }
  if (msg && msg.type === 'extractPageContent') {
    // Extract main text content from the page
    try {
      let content = '';
      // Try to get main content area (common semantic elements)
      const mainSelectors = ['main', 'article', '[role="main"]', '.main-content', '#main-content', '#content'];
      let mainContent = null;
      for (const selector of mainSelectors) {
        mainContent = document.querySelector(selector);
        if (mainContent) break;
      }
      // If no main content found, use body
      const sourceElement = mainContent || document.body;
      // Extract text, filtering out script/style tags
      const clone = sourceElement.cloneNode(true);
      const unwanted = clone.querySelectorAll('script, style, noscript, iframe, svg');
      unwanted.forEach(el => el.remove());
      content = clone.innerText || clone.textContent || '';
      // Clean up whitespace
      content = content.replace(/\s+/g, ' ').trim();
      // Limit to ~10000 characters to avoid token limits
      if (content.length > 10000) {
        content = content.substring(0, 10000) + '... [content truncated]';
      }
      if (content.length < 50) {
        sendResponse({ error: 'Page content is too short or empty' });
      } else {
        sendResponse({ content });
      }
    } catch (e) {
      sendResponse({ error: 'Failed to extract page content: ' + e.message });
    }
    return true;
  }
});

// === Screen Snip Feature ===
let snipOverlay = null;
let snipStart = null;
let snipRectEl = null;

function startScreenSnip() {
  if (snipOverlay) return; // already active
  console.log('content: starting snip overlay');
  snipOverlay = document.createElement('div');
  Object.assign(snipOverlay.style, {
    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
    background: 'rgba(0,0,0,0.25)', cursor: 'crosshair', zIndex: '2147483647'
  });
  snipOverlay.addEventListener('mousedown', onSnipMouseDown);
  snipOverlay.addEventListener('mousemove', onSnipMouseMove);
  snipOverlay.addEventListener('mouseup', onSnipMouseUp);
  snipOverlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') cancelSnip(); });
  document.body.appendChild(snipOverlay);
  snipRectEl = document.createElement('div');
  Object.assign(snipRectEl.style, {
    position: 'absolute', border: '2px solid #8ab4f8', background: 'rgba(138,180,248,0.15)'
  });
  snipOverlay.appendChild(snipRectEl);
  snipOverlay.tabIndex = 0;
  snipOverlay.focus();
}

function onSnipMouseDown(e) {
  snipStart = { x: e.clientX, y: e.clientY };
  updateSnipRect(e.clientX, e.clientY);
}

function onSnipMouseMove(e) {
  if (!snipStart) return;
  updateSnipRect(e.clientX, e.clientY);
}

function onSnipMouseUp(e) {
  if (!snipStart) { cancelSnip(); return; }
  updateSnipRect(e.clientX, e.clientY);
  // Capture
  const rect = snipRectEl.getBoundingClientRect();
  console.log('content: mouseUp final rect', rect.left, rect.top, rect.width, rect.height);
  // Hide overlay elements so they don't appear in capture
  const prevDisplayRect = snipRectEl.style.display;
  const prevDisplayOverlay = snipOverlay.style.display;
  snipRectEl.style.display = 'none';
  snipOverlay.style.display = 'none';
  captureArea(rect).then(dataUrl => {
    // Send the captured image back to the extension (could be uploaded or inserted into chat)
    if (dataUrl) {
      console.log('content: capture success length', dataUrl.length);
      safeSendMessage({ type: 'snipResult', image: dataUrl });
    } else {
      console.warn('content: capture returned null');
      safeSendMessage({ type: 'snipError', error: 'Capture failed or blocked.' });
    }
  }).finally(() => {
    // Restore (though we will immediately cleanup) in case of logic changes
    snipRectEl.style.display = prevDisplayRect;
    snipOverlay.style.display = prevDisplayOverlay;
    cleanupSnip();
  });
}

function updateSnipRect(x, y) {
  const minX = Math.min(snipStart.x, x);
  const minY = Math.min(snipStart.y, y);
  const w = Math.abs(snipStart.x - x);
  const h = Math.abs(snipStart.y - y);
  Object.assign(snipRectEl.style, { left: minX + 'px', top: minY + 'px', width: w + 'px', height: h + 'px' });
}

function cancelSnip() { cleanupSnip(); }

function cleanupSnip() {
  snipStart = null;
  if (snipOverlay) {
    snipOverlay.remove();
    snipOverlay = null;
  }
  snipRectEl = null;
}

async function captureArea(rect) {
  // guard tiny selections
  if (!rect || rect.width < 2 || rect.height < 2) return null;

  // Use html2canvas approach; if not available, attempt chrome.tabs.captureVisibleTab via background
  if (window.html2canvas) {
    const canvas = await window.html2canvas(document.body, {
      useCORS: true,
      logging: false,
      scale: 1,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight
    });
    // crop using CSS pixel coordinates (scale === 1)
    const crop = document.createElement('canvas');
    crop.width = Math.max(1, Math.round(rect.width));
    crop.height = Math.max(1, Math.round(rect.height));
    const ctx = crop.getContext('2d');
    ctx.drawImage(
      canvas,
      Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height),
      0, 0, crop.width, crop.height
    );
    return crop.toDataURL('image/png');
  } else {
    // Fallback: ask background to capture tab
    return new Promise(resolve => {
      try {
        safeSendMessage({ type: 'captureVisible' }, (resp) => {
          if (resp && resp.dataUrl) {
          console.log('content: fallback capture received, cropping...');
          // We still need to crop; create image and canvas
          const img = new Image();
          img.onload = () => {
            // Account for device pixel ratio/zoom
            const scaleX = img.width / window.innerWidth;
            const scaleY = img.height / window.innerHeight;
            const sx = Math.round(rect.left * scaleX);
            const sy = Math.round(rect.top * scaleY);
            const sw = Math.round(rect.width * scaleX);
            const sh = Math.round(rect.height * scaleY);

            const crop = document.createElement('canvas');
            crop.width = Math.max(1, Math.round(rect.width));
            crop.height = Math.max(1, Math.round(rect.height));
            const ctx = crop.getContext('2d');
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, crop.width, crop.height);
            resolve(crop.toDataURL('image/png'));
          };
          img.onerror = () => resolve(null);
          img.src = resp.dataUrl;
          } else {
            console.warn('content: fallback capture error', resp && resp && resp.error);
            resolve(null);
          }
        });
      } catch (err) {
        console.warn('content: captureVisible request failed', err);
        resolve(null);
      }
    });
  }
}