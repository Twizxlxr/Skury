// --- Prevent iframe focus from stealing page focus ---
try {
  window.addEventListener('focus', () => {
    if (window.top && window.top !== window) {
      // Immediately return focus to the top window (main tab)
      try { window.top.focus(); } catch (_) {}
    }
  }, true);
} catch (err) {
  console.warn('Skury popup focus-guard failed', err);
}

// Keep-alive port to keep service worker alive while the side panel / popup is open.
let __skury_port = null;
let __skury_reconnect_timer = null;
function openKeepAlivePort() {
  if (__skury_port) return; // already open
  try {
    __skury_port = chrome.runtime.connect({ name: 'skury-keepalive' });
    __skury_port.onDisconnect.addListener(() => {
      __skury_port = null;
      console.log('Skury: keepalive port disconnected');
      if (chrome.runtime.lastError) {
          console.warn('Skury: disconnect error', chrome.runtime.lastError.message);
      }
      // Attempt to reopen after a short delay while the UI is still open
      if (!document.hidden) {
        clearTimeout(__skury_reconnect_timer);
        __skury_reconnect_timer = setTimeout(() => {
          openKeepAlivePort();
        }, 1500);
      }
    });
    __skury_port.onMessage.addListener((m) => {
      if (m && m.type === 'pong') console.log('Skury: keepalive pong');

      // *** ADDED THIS BLOCK to handle close requests ***
      if (m && m.type === 'close-self') {
        console.log('Skury: close-self message received');
        window.close(); // This will close the side panel
      }
      // *** END OF ADDED BLOCK ***
    });
    
    // optional ping loop
    try {
      const ping = () => __skury_port && __skury_port.postMessage({ type: 'ping' });
      const pid = setInterval(() => { if (!__skury_port) clearInterval(pid); else ping(); }, 30000);
    } catch (e) {}
    console.log('Skury: keepalive port opened');
  } catch (e) {
    console.warn('Skury: could not open keepalive port', e);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // wire the simple send button but also open the keepalive port so the
  // service worker remains active while this UI is open.
  openKeepAlivePort();

  // Chat functionality is handled by sidebar.js
  console.log('Skury popup.js loaded - chat handled by sidebar.js');
});