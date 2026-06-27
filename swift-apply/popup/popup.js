// SwiftApply Popup

document.addEventListener('DOMContentLoaded', async () => {
  // Check API key status
  const { hasKey } = await sendToBackground({ type: 'GET_API_KEY_STATUS' });
  if (!hasKey) {
    document.getElementById('api-warning').style.display = 'flex';
  }

  // Show current site in footer
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    try {
      const hostname = new URL(tab.url).hostname.replace('www.', '');
      document.getElementById('popup-site').textContent = hostname;
    } catch(e) {}
  }

  // Toggle sidebar button
  document.getElementById('btn-toggle-sidebar').addEventListener('click', async () => {
    await injectContentIfNeeded(tab);
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' });
    window.close();
  });

  // Autofill button
  document.getElementById('btn-autofill').addEventListener('click', async () => {
    const btn = document.getElementById('btn-autofill');
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-icon">⏳</span>Filling...';

    await injectContentIfNeeded(tab);
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'AUTOFILL_FORM' });
    const filled = response?.result?.filled?.length || 0;

    showStatus(`Filled ${filled} field${filled !== 1 ? 's' : ''}`);
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">✏️</span>Auto-Fill Form';
  });

  // Settings links
  document.getElementById('open-settings').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  document.getElementById('footer-settings').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  document.getElementById('btn-open-settings')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});

async function injectContentIfNeeded(tab) {
  try {
    // Try sending a ping first to see if content script is alive
    await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
  } catch(e) {
    // Content script not injected — inject it now
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['sidebar/sidebar.css'] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/content.js'] });
    } catch(err) {
      console.warn('Could not inject content script:', err);
    }
  }
}

function sendToBackground(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) { resolve({}); return; }
      resolve(response || {});
    });
  });
}

function showStatus(text) {
  const status = document.getElementById('popup-status');
  document.getElementById('status-text').textContent = text;
  status.style.display = 'block';
  setTimeout(() => { status.style.display = 'none'; }, 3000);
}
