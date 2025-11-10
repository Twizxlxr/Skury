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

// === In-page side panel (iframe with invisible focus proxy) ===
let skuryPanel = null;
let skuryIframe = null;
let focusProxy = null;

async function ensureInPagePanel() {
  if (skuryPanel) return skuryPanel;

  // === Sidebar container ===
  skuryPanel = document.createElement('div');
  skuryPanel.id = 'skuryPanel';
  Object.assign(skuryPanel.style, {
    position: 'fixed',
    top: '0',
    right: '0',
    width: '420px',
    height: '100vh',
    zIndex: '2147483646',
    background: 'transparent',
    display: 'none',
    transform: 'translateX(100%)',
    opacity: '0',
    transition: 'transform 0.3s ease, opacity 0.3s ease'
  });

  // === Invisible focus proxy ===
  focusProxy = document.createElement('iframe');
  Object.assign(focusProxy.style, {
    position: 'absolute',
    top: '0',
    left: '-9999px',
    width: '1px',
    height: '1px',
    opacity: '0',
    pointerEvents: 'none'
  });
  document.body.appendChild(focusProxy);

  // === Sidebar iframe ===
  skuryIframe = document.createElement('iframe');
  skuryIframe.src = chrome.runtime.getURL('popup.html');
  skuryIframe.allow = 'clipboard-write';
  Object.assign(skuryIframe.style, {
    width: '100%',
    height: '100%',
    border: 'none',
    pointerEvents: 'auto'
  });
  skuryIframe.setAttribute('tabindex', '-1');

  // Auto-restore main tab focus if iframe ever becomes active
  setInterval(() => {
    if (document.activeElement === skuryIframe) {
      try { focusProxy.focus(); } catch (_) {}
    }
  }, 100);

  skuryPanel.appendChild(skuryIframe);
  document.body.appendChild(skuryPanel);
  console.log('Skury sidebar initialized');
  return skuryPanel;
}

// (Removed shadow DOM bridge code; iframe approach restored.)

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

  if (shouldOpen) {
    panel.style.display = 'block';
    requestAnimationFrame(() => {
      panel.style.transform = 'translateX(0)';
      panel.style.opacity = '1';
    });
  } else {
    panel.style.transform = 'translateX(100%)';
    panel.style.opacity = '0';
    setTimeout(() => (panel.style.display = 'none'), 300);
  }
}

function applyPanelTheme(theme) {
  const panel = document.getElementById('skuryPanel');
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