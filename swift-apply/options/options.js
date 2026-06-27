// SwiftApply Options Page

document.addEventListener('DOMContentLoaded', () => {
  loadSavedKey();
  attachEvents();
});

function loadSavedKey() {
  chrome.storage.sync.get(['geminiApiKey'], (result) => {
    if (result.geminiApiKey) {
      document.getElementById('api-key').value = result.geminiApiKey;
      setHint('api-key-status', '✓ API key saved', 'hint-ok');
    }
  });
}

function attachEvents() {
  document.getElementById('save-api-key').addEventListener('click', saveApiKey);
  document.getElementById('test-api-key').addEventListener('click', testApiKey);
  document.getElementById('toggle-visibility').addEventListener('click', toggleVisibility);

  document.getElementById('api-key').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveApiKey();
  });
}

function saveApiKey() {
  const key = document.getElementById('api-key').value.trim();

  if (!key) {
    setHint('api-key-status', 'Please enter your API key', 'hint-error');
    return;
  }

  if (!key.startsWith('AIza')) {
    setHint('api-key-status', 'Warning: Key does not look like a Gemini API key (should start with AIza)', 'hint-error');
  }

  chrome.storage.sync.set({ geminiApiKey: key }, () => {
    setHint('api-key-status', '✓ API key saved successfully', 'hint-ok');
    showToast('API key saved!', 'success');
  });
}

async function testApiKey() {
  const key = document.getElementById('api-key').value.trim();
  const btn = document.getElementById('test-api-key');

  if (!key) {
    setHint('api-key-status', 'Enter an API key first', 'hint-error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Testing...';
  setHint('api-key-status', 'Testing connection...', 'hint-info');

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Hi' }] }],
          generationConfig: { maxOutputTokens: 5 }
        })
      }
    );

    if (response.ok) {
      setHint('api-key-status', '✓ Connection successful! API key is valid.', 'hint-ok');
      showToast('API key is working!', 'success');
      chrome.storage.sync.set({ geminiApiKey: key });
    } else {
      const data = await response.json().catch(() => ({}));
      const msg = data?.error?.message || `Error ${response.status}`;
      setHint('api-key-status', `✗ ${msg}`, 'hint-error');
      showToast('API key test failed', 'error');
    }
  } catch(err) {
    setHint('api-key-status', `✗ Could not connect: ${err.message}`, 'hint-error');
    showToast('Connection error', 'error');
  }

  btn.disabled = false;
  btn.textContent = 'Test Connection';
}

function toggleVisibility() {
  const input = document.getElementById('api-key');
  const btn = document.getElementById('toggle-visibility');
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🔒';
  } else {
    input.type = 'password';
    btn.textContent = '👁';
  }
}

function setHint(elementId, text, className) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = text;
  el.className = `field-hint ${className}`;
}

function showToast(message, type) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast toast-${type} show`;
  setTimeout(() => {
    toast.className = `toast toast-${type}`;
  }, 3000);
}
