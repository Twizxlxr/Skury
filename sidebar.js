// Wait for the HTML document to be fully loaded and parsed
document.addEventListener("DOMContentLoaded", () => {
  
  // Theme management with segmented switch
  const themeOptions = Array.from(document.querySelectorAll('.theme-option'));

  function applyTheme(theme) {
    // Only dark or light supported
    const normalized = (theme === 'dark' || theme === 'light') ? theme : 'dark';
    document.documentElement.setAttribute('data-theme', normalized);
    chrome.runtime.sendMessage({ type: 'themeChanged', theme: normalized });
    chrome.storage.local.set({ skuryTheme: normalized });
    updateThemeSwitch(normalized);
  }

  function updateThemeSwitch(activeTheme) {
    themeOptions.forEach(btn => {
      const t = btn.getAttribute('data-theme');
      if (t === activeTheme) {
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
      }
    });
  }

  // Removed Adaptive mode and polling

  // Load saved theme
  chrome.storage.local.get(['skuryTheme'], (result) => {
    const saved = result.skuryTheme;
    applyTheme(saved);
  });

  // Bind click handlers
  themeOptions.forEach(btn => {
    btn.addEventListener('click', () => {
      const chosen = btn.getAttribute('data-theme');
      applyTheme(chosen);
    });
  });
  
  // Get elements from popup.html
  const chatInput = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");
  const chatOutput = document.getElementById("chatOutput");
  // status bar removed
  const snipBtn = document.getElementById("snipBtn");
  const clearBtn = document.getElementById("clearBtn");
  const readPageBtn = document.getElementById("readPageBtn");
  const uploadBtn = document.getElementById("uploadBtn");
  const fileInput = document.getElementById("fileInput");

  // Check if elements were found.
  if (!chatInput || !sendBtn || !chatOutput) {
    console.error("Skury Error: Could not find required HTML elements in sidebar.");
    return; // Stop the script
  }

  // Show greeting on first load if chat is empty
  if (chatOutput.children.length === 0) {
    showGreeting();
  }

  function showGreeting() {
    const greeting = document.createElement('div');
    greeting.className = 'greeting-container';
    greeting.innerHTML = `
      <h2>Hi,</h2>
      <p>How can I assist you today?</p>
      <div class="quick-actions">
        <button class="quick-pill" data-action="summarize">Summarize this page</button>
        <button class="quick-pill" data-action="explain">Explain selection</button>
        <button class="quick-pill" data-action="translate">Translate text</button>
        <button class="quick-pill" data-action="snip">Analyze screenshot</button>
      </div>
    `;
    chatOutput.appendChild(greeting);
    
    // Wire up quick actions
    greeting.querySelectorAll('.quick-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const action = pill.getAttribute('data-action');
        handleQuickAction(action);
      });
    });
  }

  function handleQuickAction(action) {
    // Clear greeting
    chatOutput.innerHTML = '';
    
    switch(action) {
      case 'summarize':
        if (readPageBtn) readPageBtn.click();
        break;
      case 'explain':
        chatInput.value = 'Explain the selected text on this page';
        sendMessage();
        break;
      case 'translate':
        chatInput.value = 'Translate the selected text to English';
        sendMessage();
        break;
      case 'snip':
        if (snipBtn) snipBtn.click();
        break;
    }
  }

  // Bind toolbar actions
  if (readPageBtn) {
    readPageBtn.addEventListener('click', () => {
  // status removed
      chrome.runtime.sendMessage({ type: 'readPage' }, (response) => {
        if (response && response.content) {
          // Add page content indicator to chat
          const pageMsg = document.createElement('div');
          pageMsg.className = 'chat-message you';
          pageMsg.innerHTML = '<strong>Page Content:</strong> Content captured from active tab';
          chatOutput.appendChild(pageMsg);
          
          const loadingMsg = addMessageToChat("Gemini", "Analyzing page...");
          
          // Send to Gemini for analysis
          chrome.runtime.sendMessage({ 
            type: "callGemini", 
            prompt: `Please analyze and summarize the following webpage content:\n\n${response.content}` 
          }, (aiResponse) => {
            if (aiResponse.error) {
              loadingMsg.innerHTML = `<strong>Error:</strong> ${aiResponse.error}`;
            } else {
              loadingMsg.innerHTML = `<strong>Gemini:</strong> ${aiResponse.reply.replace(/\n/g, '<br>')}`;
            }
            chatOutput.scrollTop = chatOutput.scrollHeight;
          });
        } else if (response && response.error) {
          const err = document.createElement('div');
          err.className = 'chat-message gemini';
          err.innerHTML = `<strong>Error:</strong> ${response.error}`;
          chatOutput.appendChild(err);
          chatOutput.scrollTop = chatOutput.scrollHeight;
        }
      });
    });
  }
  if (snipBtn) {
    snipBtn.addEventListener('click', () => {
  // status removed
      chrome.runtime.sendMessage({ type: 'initiateSnip' });
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      // Clear all messages and restore the greeting screen
      chatOutput.innerHTML = '';
      showGreeting();
    });
  }

  // File upload handling (text + images, basic docs fallback)
  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const maxChars = 20000;
      const maxImageBytes = 2 * 1024 * 1024; // 2MB

      const mime = (file.type || '').toLowerCase();
      const isTextLike = /^text\//.test(mime) || /(json|javascript|csv|markdown|xml)/.test(mime) || /\.(txt|md|json|csv|log|html?|js|ts|tsx|py|java|c(pp)?|cs|rb|go)$/i.test(file.name);
      const isImage = /^image\//.test(mime) || /\.(png|jpe?g|gif|webp)$/i.test(file.name);
      const isDoc = /(pdf|msword|officedocument|rtf)/.test(mime) || /\.(pdf|doc|docx|rtf)$/i.test(file.name);

      // Image flow
      if (isImage) {
        if (file.size > maxImageBytes) {
          addMessageToChat('Gemini', `Image too large (>${Math.round(maxImageBytes/1024/1024)}MB). Please pick a smaller image.`);
          return;
        }
        const reader = new FileReader();
        reader.onerror = () => addMessageToChat('Gemini', `Error reading image: ${file.name}`);
        reader.onload = () => {
          const dataUrl = reader.result;
          // Show preview message
          const imgMsg = document.createElement('div');
          imgMsg.className = 'chat-message you';
          imgMsg.innerHTML = `<strong>You (Image)</strong>`;
          const img = new Image(); img.src = dataUrl; img.style.maxWidth = '100%'; img.style.borderRadius = '6px';
          imgMsg.appendChild(img);
          chatOutput.appendChild(imgMsg);

          const userPrompt = chatInput.value.trim();
          const effectivePrompt = userPrompt || `Describe and analyze this image (${file.name}).`;
          chatInput.value = '';
          const loadingMsg = addMessageToChat('Gemini', 'Analyzing image...');
          chrome.runtime.sendMessage({ type: 'callGemini', prompt: effectivePrompt, imageData: dataUrl }, (resp) => {
            if (resp && resp.error) {
              loadingMsg.innerHTML = `<strong>Error:</strong> ${resp.error}`;
            } else if (resp && resp.reply) {
              loadingMsg.innerHTML = `<strong>Gemini:</strong> ${resp.reply.replace(/\n/g,'<br>')}`;
            } else {
              loadingMsg.innerHTML = '<strong>Error:</strong> No response';
            }
            chatOutput.scrollTop = chatOutput.scrollHeight;
          });
        };
        reader.readAsDataURL(file);
        return;
      }

      // Text flow
      if (isTextLike) {
        const reader = new FileReader();
        reader.onerror = () => { addMessageToChat('Gemini', `Error reading file: ${file.name}`); };
        reader.onload = () => {
          let text = reader.result || '';
          if (typeof text !== 'string') { addMessageToChat('Gemini', 'Unsupported file format.'); return; }
          const originalLength = text.length;
          if (text.length > maxChars) text = text.slice(0, maxChars) + '\n...[truncated]';
          addMessageToChat('You', `Uploaded file: ${file.name} (${originalLength} chars${originalLength>maxChars? ', truncated':''})`);
          const userPrompt = chatInput.value.trim();
          const effectivePrompt = userPrompt
            ? `${userPrompt}\n\nFile (${file.name}):\n${text}`
            : `Summarize and analyze the following file (${file.name}):\n\n${text}`;
          chatInput.value = '';
          const loadingMsg = addMessageToChat('Gemini', 'Analyzing file...');
          chrome.runtime.sendMessage({ type: 'callGemini', prompt: effectivePrompt }, (resp) => {
            if (resp && resp.error) {
              loadingMsg.innerHTML = `<strong>Error:</strong> ${resp.error}`;
            } else if (resp && resp.reply) {
              loadingMsg.innerHTML = `<strong>Gemini:</strong> ${resp.reply.replace(/\n/g,'<br>')}`;
            } else {
              loadingMsg.innerHTML = '<strong>Error:</strong> No response';
            }
            chatOutput.scrollTop = chatOutput.scrollHeight;
          });
        };
        reader.readAsText(file);
        return;
      }

      // Docs/PDF fallback (no native parser here)
      if (isDoc) {
        addMessageToChat('Gemini', `Direct reading of ${file.name} isn't supported yet. Convert to text or image, or paste content here.`);
        return;
      }

      // Unknown type
      addMessageToChat('Gemini', `Unsupported file type: ${file.name}`);
    });
  }

  // 1. Send Message
  sendBtn.addEventListener("click", sendMessage);
  
  // Keep a reference to the current snip attachment (not sent automatically)
  let snipAttachment = null; // { dataUrl, el }

  // Listen for snip results from content – keep it in the input area with an X to remove
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'snipResult' && msg.image) {
      // If a previous attachment exists, remove it (one at a time for simplicity)
      if (snipAttachment?.el) snipAttachment.el.remove();

      const inputArea = document.querySelector('.input-area');
      const inputWrapper = document.querySelector('.input-wrapper');
      const container = document.createElement('div');
      container.id = 'snipAttachment';

      const thumb = new Image();
      thumb.src = msg.image;

      const info = document.createElement('div');
      info.className = 'info';
      info.textContent = 'Screenshot attached';

      const xBtn = document.createElement('button');
      xBtn.textContent = '×';
      xBtn.title = 'Remove snip';
      xBtn.addEventListener('click', () => {
        container.remove();
        snipAttachment = null;
      });

      container.appendChild(thumb);
      container.appendChild(info);
      container.appendChild(xBtn);
      // Place the attachment inside the input area, above the input box
      if (inputArea) inputArea.insertBefore(container, inputWrapper || inputArea.firstChild);
      snipAttachment = { dataUrl: msg.image, el: container };

  chatInput.focus();
    }
    if (msg && msg.type === 'snipError') {
      const err = document.createElement('div');
      err.className = 'chat-message gemini';
      err.innerHTML = `<strong>System:</strong> ${msg.error || 'Snip failed.'}`;
      chatOutput.appendChild(err);
  chatOutput.scrollTop = chatOutput.scrollHeight;
    }
  });
  
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      // If 'Enter' is pressed WITHOUT 'Shift'
      e.preventDefault(); // Prevents a new line
      sendMessage();      // Sends the message
    }
    // If 'Shift' + 'Enter' is pressed, it inserts a new line by default
  });

  function sendMessage() {
    const prompt = chatInput.value.trim();
    const hasSnip = !!(snipAttachment && snipAttachment.dataUrl);
    if (!prompt && !hasSnip) return; // nothing to send

    let imageForApi; // declare at function scope
    // If a snip is attached, send it first as a separate chat block
    if (hasSnip) {
      const imgMsg = document.createElement('div');
      imgMsg.className = 'chat-message you';
      imgMsg.innerHTML = '<strong>You (Snip)</strong>';
      const img = new Image();
      img.src = snipAttachment.dataUrl;
      img.style.maxWidth = '100%';
      img.style.borderRadius = '6px';
      imgMsg.appendChild(img);
      chatOutput.appendChild(imgMsg);

      // Clear the attachment UI
      if (snipAttachment.el) snipAttachment.el.remove();
      imageForApi = snipAttachment.dataUrl; // keep to send to background
      snipAttachment = null;
    }

    // If there is prompt text, send it as a normal message
    if (prompt) {
      addMessageToChat("You", prompt);
    }
    chatInput.value = "";
    
    const loadingMsg = addMessageToChat("Gemini", "Thinking...");

    // Call background script with optional image; include simple timeout safety
    let responded = false;
    const timeoutId = setTimeout(() => {
      if (!responded) {
        loadingMsg.innerHTML = '<strong>Error:</strong> Request timed out. Please try again.';
      }
    }, 30000); // 30s safety timeout

    chrome.runtime.sendMessage({ type: "callGemini", prompt, imageData: typeof imageForApi !== 'undefined' ? imageForApi : undefined }, (response) => {
      responded = true;
      clearTimeout(timeoutId);
      if (!response) {
        loadingMsg.innerHTML = '<strong>Error:</strong> No response from background.';
      } else if (response.error) {
        loadingMsg.innerHTML = `<strong>Error:</strong> ${response.error}`;
      } else {
        loadingMsg.innerHTML = `<strong>Gemini:</strong> ${response.reply.replace(/\n/g, '<br>')}`;
      }
      chatOutput.scrollTop = chatOutput.scrollHeight;
    });
  }

  // 2. Helper function to add messages to the UI
  function addMessageToChat(sender, message) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `chat-message ${sender.toLowerCase()}`;
    
    // Use innerHTML to allow for <strong> tags and <br>
    msgDiv.innerHTML = `<strong>${sender}:</strong> ${message}`;
    
    // Add action bar for AI responses
    if (sender.toLowerCase() === 'gemini') {
      const actionBar = document.createElement('div');
      actionBar.className = 'message-actions';
      actionBar.innerHTML = `
        <button class="action-icon" data-action="copy" title="Copy">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
        <button class="action-icon" data-action="regenerate" title="Regenerate">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
        <button class="action-icon" data-action="share" title="Share">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="18" cy="5" r="3"></circle>
            <circle cx="6" cy="12" r="3"></circle>
            <circle cx="18" cy="19" r="3"></circle>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
          </svg>
        </button>
        <button class="action-icon" data-action="feedback" title="Feedback">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
          </svg>
        </button>
      `;
      msgDiv.appendChild(actionBar);
      
      // Wire up actions
      actionBar.querySelectorAll('.action-icon').forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.getAttribute('data-action');
          handleMessageAction(action, msgDiv, message);
        });
      });
    }
    
    chatOutput.appendChild(msgDiv);
    chatOutput.scrollTop = chatOutput.scrollHeight; // Auto-scroll
    return msgDiv; // Return the element
  }

  function handleMessageAction(action, msgDiv, messageText) {
    const textContent = msgDiv.querySelector('strong').nextSibling.textContent.trim();
    
    switch(action) {
      case 'copy':
        navigator.clipboard.writeText(textContent).then(() => {
          // Show brief feedback
          const btn = msgDiv.querySelector('[data-action="copy"]');
          const originalHTML = btn.innerHTML;
          btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
          setTimeout(() => btn.innerHTML = originalHTML, 1000);
        });
        break;
      case 'regenerate':
        // Find the last user message before this AI message
        const messages = Array.from(chatOutput.children);
        const aiIndex = messages.indexOf(msgDiv);
        let lastPrompt = '';
        for (let i = aiIndex - 1; i >= 0; i--) {
          if (messages[i].classList.contains('you')) {
            const strong = messages[i].querySelector('strong');
            lastPrompt = strong ? strong.nextSibling.textContent.trim() : '';
            break;
          }
        }
        if (lastPrompt) {
          chatInput.value = lastPrompt;
          sendMessage();
        }
        break;
      case 'share':
        // Copy shareable link or text
        const shareText = `Skury AI Response:\n\n${textContent}`;
        navigator.clipboard.writeText(shareText);
        break;
      case 'feedback':
        // Could open a feedback form or log
        console.log('Feedback for:', textContent.substring(0, 50));
        break;
    }
  }
  
  console.log("Skury sidebar.js loaded successfully.");

});