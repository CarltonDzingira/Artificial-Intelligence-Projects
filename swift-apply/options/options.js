// SwiftApply Options Page

document.addEventListener('DOMContentLoaded', () => {
  loadSavedKey();
  loadOllamaSettings();
  attachEvents();
  loadHealthStatus();
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

  document.getElementById('run-health-check')?.addEventListener('click', runHealthCheck);

  document.getElementById('save-ollama')?.addEventListener('click', () => {
    const model = document.getElementById('ollama-model')?.value.trim() || 'gemma3:4b';
    chrome.storage.sync.set({ ollamaModel: model }, () => showToast('Ollama model saved: ' + model, 'success'));
  });

  document.getElementById('test-ollama')?.addEventListener('click', () => {
    const hint = document.getElementById('ollama-hint');
    if (hint) hint.textContent = 'Checking...';
    chrome.runtime.sendMessage({ type: 'CHECK_OLLAMA' }, (response) => {
      if (hint) {
        if (response?.available) {
          hint.textContent = 'Ollama is running and ready';
          hint.style.color = '#16a34a';
        } else {
          hint.textContent = 'Ollama not detected — run: ollama serve';
          hint.style.color = '#dc2626';
        }
      }
    });
  });
}

function loadOllamaSettings() {
  chrome.storage.sync.get(['ollamaModel'], (result) => {
    const input = document.getElementById('ollama-model');
    if (input) input.value = result.ollamaModel || 'gemma3:4b';
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

async function loadHealthStatus() {
  // Gemini + quota
  chrome.storage.sync.get(['geminiApiKey'], (result) => {
    const geminiEl = document.getElementById('health-gemini');
    const quotaEl = document.getElementById('health-quota');
    const routingEl = document.getElementById('health-routing');
    if (!result.geminiApiKey) {
      if (geminiEl) { geminiEl.textContent = 'No API key ✗'; geminiEl.style.color = '#dc2626'; }
      if (routingEl) { routingEl.textContent = 'Ollama only (no Gemini key)'; routingEl.style.color = '#f59e0b'; }
    } else {
      if (geminiEl) { geminiEl.textContent = 'Key saved ✓'; geminiEl.style.color = '#16a34a'; }
    }
    chrome.runtime.sendMessage({ type: 'GET_QUOTA_STATUS' }, (response) => {
      if (response && quotaEl) {
        quotaEl.textContent = `${response.callsToday} / ${response.limit} calls (${response.percentage}%)`;
        quotaEl.style.color = response.percentage >= 100 ? '#dc2626' : response.percentage >= 80 ? '#f59e0b' : '#16a34a';
      }
      if (response && routingEl && result.geminiApiKey) {
        if (response.callsToday >= response.limit) {
          routingEl.textContent = 'Auto-switched to Ollama (quota exceeded)';
          routingEl.style.color = '#f59e0b';
        } else {
          routingEl.textContent = 'Gemini active';
          routingEl.style.color = '#16a34a';
        }
      }
    });
  });

  // Ollama status from storage
  chrome.storage.local.get(['ollamaOnline', 'ollamaLastCheck', 'ollamaModel'], (result) => {
    const ollamaEl = document.getElementById('health-ollama');
    const timeEl = document.getElementById('health-ollama-time');
    const model = result.ollamaModel || 'gemma3:4b';
    if (ollamaEl) {
      if (result.ollamaOnline === false) {
        ollamaEl.textContent = 'Offline ✗ — run: ollama serve';
        ollamaEl.style.color = '#dc2626';
      } else if (result.ollamaOnline === true) {
        ollamaEl.textContent = `Online ✓ (${model})`;
        ollamaEl.style.color = '#16a34a';
      } else {
        ollamaEl.textContent = 'Not checked yet';
        ollamaEl.style.color = '#94a3b8';
      }
    }
    if (timeEl && result.ollamaLastCheck) {
      const mins = Math.round((Date.now() - result.ollamaLastCheck) / 60000);
      timeEl.textContent = mins < 1 ? 'Just now' : `${mins} minute${mins === 1 ? '' : 's'} ago`;
    }
  });
}

async function runHealthCheck() {
  const statusEl = document.getElementById('health-check-status');
  if (statusEl) { statusEl.textContent = 'Running health check...'; statusEl.style.color = '#6366f1'; }

  // Test Gemini key
  const key = document.getElementById('api-key')?.value.trim();
  const geminiEl = document.getElementById('health-gemini');
  if (key) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Hi' }] }], generationConfig: { maxOutputTokens: 3 } })
      });
      if (geminiEl) {
        geminiEl.textContent = r.ok ? 'Connected ✓' : `Error ${r.status} ✗`;
        geminiEl.style.color = r.ok ? '#16a34a' : '#dc2626';
      }
    } catch(e) {
      if (geminiEl) { geminiEl.textContent = 'Cannot connect ✗'; geminiEl.style.color = '#dc2626'; }
    }
  }

  // Test Ollama
  chrome.runtime.sendMessage({ type: 'CHECK_OLLAMA' }, (response) => {
    const ollamaEl = document.getElementById('health-ollama');
    const timeEl = document.getElementById('health-ollama-time');
    if (ollamaEl) {
      ollamaEl.textContent = response?.available ? 'Online ✓ (gemma3:4b)' : 'Offline ✗ — run: ollama serve';
      ollamaEl.style.color = response?.available ? '#16a34a' : '#dc2626';
    }
    if (timeEl) timeEl.textContent = 'Just now';
    chrome.storage.local.set({ ollamaOnline: !!response?.available, ollamaLastCheck: Date.now() });

    // Refresh quota
    loadHealthStatus();
    if (statusEl) { statusEl.textContent = 'Health check complete ✓'; statusEl.style.color = '#16a34a'; }
  });
}

function showToast(message, type) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast toast-${type} show`;
  setTimeout(() => {
    toast.className = `toast toast-${type}`;
  }, 3000);
}
