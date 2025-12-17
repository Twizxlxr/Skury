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

// Safely load theme with error handling
try {
  if (chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['skuryTheme'], (result) => {
      if (chrome.runtime.lastError) {
        console.warn('Skury: Failed to load theme:', chrome.runtime.lastError);
        applyBubbleTheme('dark');
      } else {
        applyBubbleTheme(result.skuryTheme);
      }
    });
  } else {
    applyBubbleTheme('dark');
  }
} catch (e) {
  console.warn('Skury: Theme loading error:', e);
  applyBubbleTheme('dark');
}

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

  // Auto-restore main tab focus if iframe ever becomes active (optimized with 200ms interval)
  setInterval(() => {
    if (document.activeElement === skuryIframe) {
      try { focusProxy.focus(); } catch (_) {}
    }
  }, 200);

  skuryPanel.appendChild(skuryIframe);
  document.body.appendChild(skuryPanel);
  console.log('Skury sidebar initialized');
  return skuryPanel;
}

// (Removed shadow DOM bridge code; iframe approach restored.)

// helper to detect clicks outside the panel and close it
function _onDocumentMouseDown(ev) {
  try {
    const panel = document.getElementById('skuryPanel');
    if (!panel || panel.style.display === 'none') return;
    if (panel.contains(ev.target)) return; // click inside panel; ignore
    const bubble = document.getElementById('aiBubble');
    if (bubble && bubble.contains(ev.target)) return; // click on bubble; ignore
    // Don't close if snip overlay is active
    if (snipOverlay && document.body.contains(snipOverlay)) return;
    toggleInPagePanel(false);
  } catch (e) { /* no-op */ }
}

async function toggleInPagePanel(forceState) {
  const panel = await ensureInPagePanel();
  const isOpen = panel.style.display !== 'none';
  const shouldOpen = typeof forceState === 'boolean' ? forceState : !isOpen;

  if (shouldOpen) {
    panel.style.display = 'block';
    // Use will-change for smoother animations
    panel.style.willChange = 'transform, opacity';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        panel.style.transform = 'translateX(0)';
        panel.style.opacity = '1';
      });
    });
    // Add click-outside listener when panel opens
    setTimeout(() => document.addEventListener('mousedown', _onDocumentMouseDown), 100);
  } else {
    panel.style.transform = 'translateX(100%)';
    panel.style.opacity = '0';
    setTimeout(() => {
      panel.style.display = 'none';
      panel.style.willChange = 'auto'; // Release GPU resources
    }, 300);
    // Remove click-outside listener when panel closes
    document.removeEventListener('mousedown', _onDocumentMouseDown);
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
  const panel = document.getElementById('skuryPanel');
  if (e.key === 'Escape' && panel && panel.style.display !== 'none') {
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
    return crop.toDataURL('image/jpeg', 0.85); // Use JPEG with 85% quality for smaller file size
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
            resolve(crop.toDataURL('image/jpeg', 0.85)); // Use JPEG for faster transfer
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

// === Google Form Solver ===
// Collect candidate question groups (radio/checkbox sets)
function collectFormQuestions() {
  const questions = [];
  // Strategy: find containers that hold multiple radio/checkbox inputs
  const inputs = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
  const groupsByName = new Map();
  for (const inp of inputs) {
    const name = inp.name || ('__chk_' + Math.random());
    if (!groupsByName.has(name)) groupsByName.set(name, []);
    groupsByName.get(name).push(inp);
  }
  for (const [name, groupInputs] of groupsByName.entries()) {
    if (groupInputs.length < 2) continue; // need at least 2 options
    // Attempt to locate question text: look upward for text nodes or heading-like elements
    let questionText = '';
    const first = groupInputs[0];
    let container = first.closest('.freebirdFormviewerViewItemsItemItem') || first.closest('div');
    if (container) {
      // gather text excluding labels of options
      const cloned = container.cloneNode(true);
      cloned.querySelectorAll('input, label, button').forEach(el => el.remove());
      questionText = (cloned.innerText || '').trim().replace(/\s+/g, ' ');
    }
    if (!questionText) {
      // fallback: previous sibling text
      const prev = first.parentElement && first.parentElement.previousElementSibling;
      if (prev) questionText = (prev.innerText || '').trim();
    }
    if (!questionText) questionText = 'Question';
    // Collect option texts/images
    const options = groupInputs.map((inp) => {
      let labelText = '';
      let labelNode = inp.closest('label') || inp.parentElement;
      if (labelNode) {
        // Prefer explicit text
        labelText = (labelNode.innerText || '').trim().replace(/\s+/g, ' ');
        // Remove questionText overlap
        if (questionText && labelText === questionText) labelText = '';
        // If empty and contains image, mark
        const img = labelNode.querySelector('img');
        if (!labelText && img) {
          labelText = '[image option]';
        }
      }
      if (!labelText) labelText = 'Option';
      return { input: inp, label: labelText.slice(0,200) };
    });
    // Limit to A-H (8 options)
    if (options.length > 8) options.length = 8;
    questions.push({ questionText: questionText.slice(0,300), options });
  }
  return questions;
}

function buildPrompt(q) {
  let prompt = `Question: ${q.questionText}\nOptions:`;
  const letters = 'ABCDEFGH';
  q.options.forEach((opt, idx) => {
    prompt += `\n${letters[idx]}) ${opt.label}`;
  });
  prompt += `\nReturn ONLY the single best option letter.`;
  return prompt;
}

function addMarker(inputEl) {
  const labelNode = inputEl.closest('label') || inputEl.parentElement;
  if (!labelNode) return;
  if (labelNode.querySelector('.skury-answer-marker')) return; // already
  const marker = document.createElement('span');
  marker.className = 'skury-answer-marker';
  labelNode.appendChild(marker);
  inputEl.addEventListener('change', () => {
    if (inputEl.checked && marker.isConnected) marker.remove();
  }, { once: false });
}

async function solveFormWorkflow(sendResponse) {
  try {
    const questions = collectFormQuestions();
    if (!questions.length) {
      sendResponse({ error: 'No form questions detected on this page.' });
      return;
    }
    const letters = 'ABCDEFGH';
    for (const q of questions) {
      const prompt = buildPrompt(q);
      // Await model answer
      const reply = await new Promise((resolve) => {
        safeSendMessage({ type: 'callGemini', prompt }, (resp) => resolve(resp));
      });
      // Robust letter extraction A-H
      let letter = null;
      if (reply && reply.reply) {
        const text = reply.reply.trim();
        const m = text.match(/\b([A-H])\b/i) || text.match(/^(?:Option\s*)?([A-H])(?=\b)/i);
        if (m) letter = m[1].toUpperCase();
      }
      const idx = letter ? letters.indexOf(letter) : -1;
      if (idx >= 0 && q.options[idx]) {
        addMarker(q.options[idx].input);
      }
    }
    sendResponse({ solved: true, count: questions.length });
  } catch (e) {
    sendResponse({ error: e.message || 'Failed to solve form.' });
  }
}

// Dedicated listener for solveForm to keep existing listener minimal
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'solveForm') {
    solveFormWorkflow(sendResponse);
    return true; // async
  }
  if (msg && msg.type === 'analyzeGoogleForm') {
    analyzeGoogleForm(sendResponse);
    return true;
  }
  if (msg && msg.type === 'revealHint') {
    revealHint(msg.questionId, msg.optionId);
    sendResponse({ success: true });
  }
  if (msg && msg.type === 'cleanupHints') {
    cleanupAllHints();
    sendResponse({ success: true });
  }
});

// === Google Form Solver with OCR ===
let gformExtractedData = null;
let tesseractReady = false;

// Load Tesseract.js from CDN (dynamically injected into page context, not extension)
function loadTesseract() {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) { resolve(); return; }
    
    // Inject script into page context (bypasses extension CSP)
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/tesseract.min.js';
    script.onload = () => { 
      tesseractReady = true; 
      resolve(); 
    };
    script.onerror = () => reject(new Error('Failed to load Tesseract.js from CDN'));
    (document.head || document.documentElement).appendChild(script);
  });
}

// Analyze Google Form: extract questions, options, run OCR on images
async function analyzeGoogleForm(sendResponse) {
  try {
    // Check if on Google Forms
    if (!window.location.hostname.includes('docs.google.com')) {
      sendResponse({ error: 'Not on a Google Form page.' });
      return;
    }

    // Load Tesseract if needed
    if (!tesseractReady) {
      await loadTesseract();
    }

    const questions = [];
    // Google Forms structure: Use multiple strategies to find questions
    let questionContainers = Array.from(document.querySelectorAll('[role="listitem"]'));
    
    // Fallback: look for divs containing radio/checkbox groups
    if (questionContainers.length === 0) {
      const allRadios = document.querySelectorAll('input[type="radio"]');
      const allCheckboxes = document.querySelectorAll('input[type="checkbox"]');
      const containers = new Set();
      [...allRadios, ...allCheckboxes].forEach(inp => {
        // Find parent container (usually 2-4 levels up)
        let parent = inp.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
          if (parent.tagName === 'DIV' && parent.querySelectorAll('input[type="radio"], input[type="checkbox"]').length >= 2) {
            containers.add(parent);
            break;
          }
          parent = parent.parentElement;
        }
      });
      questionContainers = Array.from(containers);
    }
    
    console.log('Skury: Found', questionContainers.length, 'question containers');
    
    for (let i = 0; i < questionContainers.length; i++) {
      const container = questionContainers[i];
      const qData = { id: `q${i}`, questionText: '', options: [], meta: { type: 'unknown', required: false, rawDom: container } };

      // Extract question text - try multiple selectors
      let questionTextEl = container.querySelector('[role="heading"]');
      if (!questionTextEl) {
        questionTextEl = container.querySelector('[jsname], div[class*="question"], div[class*="Question"]');
      }
      if (!questionTextEl) {
        // Find first text node with substantial content
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        let node;
        while (node = walker.nextNode()) {
          const text = node.textContent.trim();
          if (text.length > 10 && !text.match(/^[A-D]\)/) && node.parentElement.tagName !== 'LABEL') {
            qData.questionText = text.slice(0, 500);
            break;
          }
        }
      } else {
        qData.questionText = questionTextEl.innerText.trim().replace(/^\d+\.\s*/, '').slice(0, 500);
      }

      // Check for images in question (skip OCR for now for speed)
      const qImages = container.querySelectorAll('img');
      if (qImages.length > 0) {
        qData.questionText += ` [${qImages.length} image(s)]`;
      }

      // Detect question type and extract options
      const radioInputs = container.querySelectorAll('input[type="radio"]');
      const checkboxInputs = container.querySelectorAll('input[type="checkbox"]');
      
      if (radioInputs.length > 0) {
        qData.meta.type = 'radio';
        for (const radio of radioInputs) {
          const optData = { id: radio.id || `opt${qData.options.length}`, text: '', imageText: '', element: radio };
          
          // Try multiple ways to find label text
          let labelText = '';
          const label = radio.closest('label');
          if (label) {
            labelText = label.innerText.trim();
          } else {
            // Look for adjacent text node or span
            let sibling = radio.nextSibling;
            while (sibling && !labelText) {
              if (sibling.nodeType === Node.TEXT_NODE) {
                labelText = sibling.textContent.trim();
              } else if (sibling.nodeType === Node.ELEMENT_NODE) {
                labelText = sibling.innerText?.trim() || '';
                if (labelText) break;
              }
              sibling = sibling.nextSibling;
            }
            // Fallback: look at parent's text
            if (!labelText) {
              labelText = radio.parentElement?.innerText?.trim() || '';
            }
          }
          
          optData.text = labelText.slice(0, 300);
          if (!optData.text) optData.text = `Option ${qData.options.length + 1}`;
          qData.options.push(optData);
        }
      } else if (checkboxInputs.length > 0) {
        qData.meta.type = 'checkbox';
        for (const checkbox of checkboxInputs) {
          const optData = { id: checkbox.id || `opt${qData.options.length}`, text: '', imageText: '', element: checkbox };
          
          let labelText = '';
          const label = checkbox.closest('label');
          if (label) {
            labelText = label.innerText.trim();
          } else {
            let sibling = checkbox.nextSibling;
            while (sibling && !labelText) {
              if (sibling.nodeType === Node.TEXT_NODE) {
                labelText = sibling.textContent.trim();
              } else if (sibling.nodeType === Node.ELEMENT_NODE) {
                labelText = sibling.innerText?.trim() || '';
                if (labelText) break;
              }
              sibling = sibling.nextSibling;
            }
            if (!labelText) {
              labelText = checkbox.parentElement?.innerText?.trim() || '';
            }
          }
          
          optData.text = labelText.slice(0, 300);
          if (!optData.text) optData.text = `Option ${qData.options.length + 1}`;
          
          // Skip OCR for images to improve speed
          qData.options.push(optData);
        }
      }

      // Check if required
      if (container.querySelector('[aria-required="true"]') || container.innerText.includes('*')) {
        qData.meta.required = true;
      }

      // Only add if we found both question text and options
      if (qData.options.length > 0 && qData.questionText) {
        questions.push(qData);
      }
    }

    console.log('Skury: Extracted', questions.length, 'questions');
    
    if (questions.length === 0) {
      sendResponse({ error: 'No form questions detected. Make sure the form is fully loaded.' });
      return;
    }

    gformExtractedData = questions;
    sendResponse({ success: true, questions: questions.map(q => ({
      id: q.id,
      questionText: q.questionText,
      options: q.options.map(o => ({ id: o.id, text: o.text, imageText: o.imageText })),
      meta: { type: q.meta.type, required: q.meta.required }
    })) });
  } catch (error) {
    console.error('analyzeGoogleForm error:', error);
    sendResponse({ error: error.message || 'Failed to analyze form' });
  }
}

// Reveal hint: inject subtle marker beside the option
function revealHint(questionId, optionId) {
  try {
    if (!gformExtractedData) return;
    const question = gformExtractedData.find(q => q.id === questionId);
    if (!question) return;
    const option = question.options.find(o => o.id === optionId);
    if (!option || !option.element) return;

    // Find label to attach marker
    const labelNode = option.element.closest('label') || option.element.parentElement;
    if (!labelNode) return;

    // Check if marker already exists
    if (labelNode.querySelector('.skury-hint-dot')) return;

    // Create marker
    const marker = document.createElement('span');
    marker.className = 'skury-hint-dot';
    marker.setAttribute('aria-hidden', 'true');
    marker.style.cssText = 'display:inline-block;width:8px;height:8px;border-radius:50%;background:rgba(139,92,246,0.85);margin-left:8px;opacity:0.85;pointer-events:none;vertical-align:middle;';
    labelNode.appendChild(marker);

    // Remove marker when option is selected
    const removeMarker = () => {
      if (marker.isConnected) marker.remove();
    };
    option.element.addEventListener('change', removeMarker, { once: true });
    option.element.addEventListener('click', removeMarker, { once: true });
  } catch (e) {
    console.warn('revealHint error:', e);
  }
}

// Cleanup all hint markers
function cleanupAllHints() {
  try {
    document.querySelectorAll('.skury-hint-dot').forEach(marker => marker.remove());
  } catch (e) {
    console.warn('cleanupAllHints error:', e);
  }
}