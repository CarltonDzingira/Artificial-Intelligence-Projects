// SwiftApply Background Service Worker
// Handles Gemini API calls and DOCX template processing

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const OLLAMA_URL = "http://localhost:11434/api/generate";
const QUOTA_LIMIT = 250;
const QUOTA_WARN = 200;

// ─── Quota Counter ─────────────────────────────────────────────────────────────
function getTodayWarsaw() {
  // Use Warsaw local date so quota resets at midnight local time, not UTC midnight
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Warsaw' });
}

async function getQuotaToday() {
  const today = getTodayWarsaw();
  const { geminiCallsToday = 0, geminiCallsDate = '' } = await chrome.storage.local.get(['geminiCallsToday', 'geminiCallsDate']);
  console.log('[SA-QUOTA] calls today:', geminiCallsToday, '| stored date:', geminiCallsDate, '| today:', today, '| match:', geminiCallsDate === today);
  if (geminiCallsDate !== today) return 0;
  return geminiCallsToday;
}

async function incrementGeminiQuota() {
  const today = getTodayWarsaw();
  const { geminiCallsToday = 0, geminiCallsDate = '' } = await chrome.storage.local.get(['geminiCallsToday', 'geminiCallsDate']);
  const count = (geminiCallsDate === today ? geminiCallsToday : 0) + 1;
  await chrome.storage.local.set({ geminiCallsToday: count, geminiCallsDate: today });
  if (count >= QUOTA_LIMIT) {
    chrome.action.setBadgeText({ text: 'MAX' });
    chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
  } else if (count >= QUOTA_WARN) {
    chrome.action.setBadgeText({ text: '80%' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
  }
  return count;
}

// ─── Quota date migration: clear stale quota data on service worker start ───────
(async () => {
  const today = getTodayWarsaw();
  const { geminiCallsDate = '' } = await chrome.storage.local.get(['geminiCallsDate']);
  if (geminiCallsDate && geminiCallsDate !== today) {
    console.log('[SA-QUOTA] Stale quota date detected (', geminiCallsDate, '→', today, ') — resetting counter to 0');
    await chrome.storage.local.set({ geminiCallsToday: 0, geminiCallsDate: today });
    chrome.action.setBadgeText({ text: '' });
  }
})();

// ─── Heartbeat Alarm ───────────────────────────────────────────────────────────
chrome.alarms.create('ollamaHeartbeat', { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'ollamaHeartbeat') return;
  const { ollamaOnline: wasOnline = true } = await chrome.storage.local.get(['ollamaOnline']);
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 3000);
    await fetch('http://localhost:11434', { signal: ctrl.signal });
    await chrome.storage.local.set({ ollamaOnline: true, ollamaLastCheck: Date.now() });
    if (!wasOnline) chrome.action.setBadgeText({ text: '' });
  } catch(e) {
    await chrome.storage.local.set({ ollamaOnline: false, ollamaLastCheck: Date.now() });
    if (wasOnline) {
      chrome.notifications.create('ollamaOffline', {
        type: 'basic', iconUrl: '../assets/icon48.png',
        title: 'SwiftApply — Ollama offline',
        message: 'Ollama stopped — AI fallback is offline. Run: ollama serve'
      });
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#f97316' });
    }
  }
});

const TEMPLATE_MAP = {
  'it_support':       'cv-it-support.docx',
  'customer_support': 'cv-customer-support.docx',
  'operations':       'cv-operations.docx',
  'qa':               'cv-game-tester.docx'
};

// ─── Message Router ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GEMINI_API_CALL") {
    handleGeminiApiCall(message.payload)
      .then(result => sendResponse({ result }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }

  if (message.type === "GEMINI_TAILOR_CV") {
    handleTailorCV(message.payload)
      .then(result => {
        console.log('[SA-CV] Sending response to content script — parsed:', result?.parsed ? 'PRESENT' : 'NULL', '| error:', result?.error || 'none');
        sendResponse(result);
      })
      .catch(error => {
        console.error('[SA-CV] handleTailorCV threw uncaught error:', error.message);
        sendResponse({ error: error.message });
      });
    return true;
  }

  if (message.type === "GET_API_KEY_STATUS") {
    chrome.storage.sync.get(['geminiApiKey'], (result) => {
      sendResponse({ hasKey: !!result.geminiApiKey });
    });
    return true;
  }

  if (message.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "GEMINI_CHAT") {
    handleGeminiChat(message.payload)
      .then(({ result, source }) => sendResponse({ result, source }))
      .catch(error => sendResponse({ error: error.message, result: null, source: 'error' }));
    return true;
  }

  if (message.type === "CHECK_OLLAMA") {
    fetch('http://localhost:11434')
      .then(r => sendResponse({ available: r.ok }))
      .catch(() => sendResponse({ available: false }));
    return true;
  }

  if (message.type === "GET_QUOTA_STATUS") {
    getQuotaToday().then(callsToday => {
      sendResponse({ callsToday, limit: QUOTA_LIMIT, percentage: Math.round(callsToday / QUOTA_LIMIT * 100) });
    });
    return true;
  }
});

// ─── Ollama API ───────────────────────────────────────────────────────────────
async function callOllamaAPI(fullPrompt, maxTokens = 800) {
  const { ollamaModel } = await chrome.storage.sync.get(['ollamaModel']);
  const model = ollamaModel || 'gemma3:4b';
  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: fullPrompt,
      stream: false,
      options: { temperature: 0.4, num_predict: maxTokens }
    })
  });
  if (!response.ok) throw new Error('Ollama not available');
  const data = await response.json();
  return data.response || '';
}

async function callOllamaFallback(fullPrompt, systemInstruction, maxTokens) {
  console.log('[SwiftApply] Switching to Ollama — Gemini quota exceeded or unavailable');
  const combined = systemInstruction ? `${systemInstruction}\n\n${fullPrompt}` : fullPrompt;
  try {
    const result = await callOllamaAPI(combined, maxTokens);
    console.log('[SwiftApply] Ollama fallback succeeded');
    return result;
  } catch(e) {
    throw new Error('Both Gemini quota exceeded and Ollama unavailable. Run: ollama serve');
  }
}

// ─── Gemini API ───────────────────────────────────────────────────────────────
function parseGeminiJSON(text) {
  if (!text) return null;
  // Strip markdown code blocks
  let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try { return JSON.parse(cleaned); } catch(e) {}
  // Extract first { ... } block
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch(e) {} }
  // Regex field extraction as last resort — supports both key naming conventions
  try {
    const summary = text.match(/"summary"\s*:\s*"([^"]+)"/)?.[1] || '';
    const skillsMatch = text.match(/"skills"\s*:\s*\[([^\]]+)\]/)?.[1] || '';
    const skills = skillsMatch.match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
    // Support new keys (bullets_job1/bullets_job2) AND legacy keys
    const job1Raw = text.match(/"bullets_job1"\s*:\s*\[([^\]]+)\]/)?.[1]
      || text.match(/"teleperformance_bullets"\s*:\s*\[([^\]]+)\]/)?.[1] || '';
    const job1 = job1Raw.match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
    const job2Raw = text.match(/"bullets_job2"\s*:\s*\[([^\]]+)\]/)?.[1]
      || text.match(/"empire_bullets"\s*:\s*\[([^\]]+)\]/)?.[1] || '';
    const job2 = job2Raw.match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
    if (summary && skills.length > 0) {
      return { summary, skills, bullets_job1: job1, bullets_job2: job2,
               teleperformance_bullets: job1, empire_bullets: job2 };
    }
  } catch(e) {}
  return null;
}

async function callGeminiAPI(fullPrompt, apiKey, maxTokens = 1000, systemInstruction = null, jsonMode = null) {
  // Auto-switch to Ollama if at quota limit
  const callsToday = await getQuotaToday();
  if (callsToday >= QUOTA_LIMIT) {
    console.log('[SwiftApply] Quota MAX reached — routing to Ollama automatically');
    return await callOllamaFallback(fullPrompt, systemInstruction, maxTokens);
  }
  const url = `${GEMINI_API_URL}?key=${apiKey}`;
  const generationConfig = { temperature: 0.4, maxOutputTokens: maxTokens, topP: 0.8, topK: 40 };
  // Only force JSON mode when explicitly requested (CV tailoring), not for chat
  const useJson = jsonMode !== null ? jsonMode : !!systemInstruction;
  if (useJson) generationConfig.responseMimeType = "application/json";
  const body = { contents: [{ parts: [{ text: fullPrompt }] }], generationConfig };
  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const errMsg = err?.error?.message || '';
      const isQuota = response.status === 429 ||
        errMsg.toLowerCase().includes('quota') ||
        errMsg.toLowerCase().includes('rate limit') ||
        errMsg.toLowerCase().includes('exceeded');
      if (isQuota) return await callOllamaFallback(fullPrompt, systemInstruction, maxTokens);
      throw new Error(errMsg || `Gemini error ${response.status}`);
    }
    const data = await response.json();
    const inputTokens = data.usageMetadata?.promptTokenCount || 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
    console.log(`[SwiftApply TOKENS] Gemini: in=${inputTokens} out=${outputTokens}`);
    await incrementGeminiQuota();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch(err) {
    const isQuota = err.message?.toLowerCase().includes('quota') ||
      err.message?.toLowerCase().includes('rate') ||
      err.message?.toLowerCase().includes('exceeded') ||
      err.message?.includes('429');
    if (isQuota) return await callOllamaFallback(fullPrompt, systemInstruction, maxTokens);
    throw err;
  }
}

async function handleGeminiApiCall({ systemPrompt, userPrompt }) {
  const { geminiApiKey } = await chrome.storage.sync.get(['geminiApiKey']);
  if (!geminiApiKey) {
    try { return await callOllamaFallback(userPrompt, systemPrompt, 1500); }
    catch(e) { throw new Error('No API key set and Ollama not running. Add Gemini key in Settings.'); }
  }
  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;
  return await callGeminiAPI(fullPrompt, geminiApiKey, 3000);
}

async function handleGeminiChat({ systemPrompt, history, userMessage }) {
  const { geminiApiKey } = await chrome.storage.sync.get(['geminiApiKey']);
  const historyText = (history || []).slice(0, -1)
    .map(m => `${m.role === 'user' ? 'Carlton' : 'Assistant'}: ${m.content}`)
    .join('\n\n');
  const fullPrompt = historyText ? `${historyText}\n\nCarlton: ${userMessage}` : userMessage;
  let result = '';
  let source = 'error';
  console.log('[SA-CHAT-SW] Chat request — hasKey:', !!geminiApiKey, '| promptLen:', fullPrompt.length);
  if (geminiApiKey) {
    try {
      result = await callGeminiAPI(fullPrompt, geminiApiKey, 1200, systemPrompt, false);
      source = 'gemini';
      console.log('[SA-CHAT-SW] Gemini responded — length:', result?.length);
    } catch(e) {
      console.log('[SA-CHAT-SW] Gemini failed:', e.message, '— trying Ollama fallback');
      try {
        result = await callOllamaFallback(fullPrompt, systemPrompt, 600);
        source = 'ollama';
        console.log('[SA-CHAT-SW] Ollama responded — first 300:', result?.substring(0, 300));
      } catch(ollamaErr) {
        console.log('[SA-CHAT-SW] Both APIs failed');
        return { result: 'Could not get a response. Gemini quota exceeded and Ollama not running. Run: ollama serve', source: 'error' };
      }
    }
  } else {
    console.log('[SA-CHAT-SW] No Gemini key — using Ollama directly');
    try {
      result = await callOllamaFallback(fullPrompt, systemPrompt, 600);
      source = 'ollama';
      console.log('[SA-CHAT-SW] Ollama responded — first 300:', result?.substring(0, 300));
    } catch(e) {
      return { result: 'No Gemini API key set and Ollama not running. Add key in Settings or run: ollama serve', source: 'error' };
    }
  }
  result = result.replace(/\s*—\s*/g, ', ');
  result = result.replace(/\*\*(.*?)\*\*/g, '$1');
  result = result.replace(/\*(.*?)\*/g, '$1');
  result = result.replace(/#{1,3}\s*/g, '');
  if (result && result.length > 10 && !/[.!?]$/.test(result.trim())) result = result.trimEnd() + '.';
  return { result, source };
}

async function handleTailorCV({ systemPrompt, userPrompt }) {
  console.log('[SA-CV] ── handleTailorCV START ──────────────────────');
  console.log('[SA-CV] systemPrompt (first 200):', systemPrompt?.substring(0, 200));
  console.log('[SA-CV] userPrompt (first 300):', userPrompt?.substring(0, 300));
  console.log('[SA-CV] total prompt chars:', (systemPrompt?.length || 0) + (userPrompt?.length || 0));

  const { geminiApiKey } = await chrome.storage.sync.get(['geminiApiKey']);
  const keyStatus = geminiApiKey
    ? `PRESENT (${geminiApiKey.substring(0, 8)}...)`
    : 'MISSING — will try Ollama';
  console.log('[SA-CV] API key status:', keyStatus);

  if (!geminiApiKey) {
    console.log('[SA-CV] No Gemini key — routing to Ollama for CV tailoring');
    try {
      const rawText = await callOllamaFallback(userPrompt, systemPrompt, 2500);
      console.log('[SA-CV] Ollama raw (first 500):', rawText?.substring(0, 500));
      const parsed = parseGeminiJSON(rawText);
      console.log('[SA-CV] Ollama parse result:', parsed ? 'SUCCESS' : 'FAILED — null returned');
      if (!parsed) return { error: 'Could not parse CV from Ollama response', parsed: null };
      return { parsed };
    } catch(e) {
      console.error('[SA-CV] Ollama also failed:', e.message);
      return { error: 'No API key and Ollama not running. Add Gemini key in Settings or run: ollama serve', parsed: null };
    }
  }

  console.log('[SA-CV] Calling Gemini with maxTokens=2500 ...');
  let rawText;
  try {
    rawText = await callGeminiAPI(userPrompt, geminiApiKey, 2500, systemPrompt);
    console.log('[SA-CV] Gemini responded. Raw length:', rawText?.length);
    console.log('[SA-CV] Gemini raw response (first 500):', rawText?.substring(0, 500));
    if (rawText?.length > 400) {
      console.log('[SA-CV] Gemini raw response (last 200):', rawText.substring(rawText.length - 200));
    }
  } catch(geminiErr) {
    console.error('[SA-CV] Gemini call threw error:', geminiErr.message);
    rawText = null;
  }

  const parsed = rawText ? parseGeminiJSON(rawText) : null;
  console.log('[SA-CV] Gemini parse result:', parsed ? 'SUCCESS' : 'FAILED');
  if (parsed) {
    console.log('[SA-CV] Parsed keys:', Object.keys(parsed));
    console.log('[SA-CV] summary present:', !!parsed.summary);
    console.log('[SA-CV] skills length:', parsed.skills?.length);
    console.log('[SA-CV] bullets_job1 length:', parsed.bullets_job1?.length);
    console.log('[SA-CV] bullets_job2 length:', parsed.bullets_job2?.length);
    return { parsed };
  }

  console.log('[SA-CV] Gemini parse failed — attempting Ollama fallback');
  try {
    const ollamaRaw = await callOllamaFallback(userPrompt, systemPrompt, 2500);
    console.log('[SA-CV] Ollama raw (first 500):', ollamaRaw?.substring(0, 500));
    const ollamaParsed = parseGeminiJSON(ollamaRaw);
    console.log('[SA-CV] Ollama parse result:', ollamaParsed ? 'SUCCESS' : 'FAILED');
    if (ollamaParsed) {
      console.log('[SA-CV] Ollama parsed keys:', Object.keys(ollamaParsed));
      return { parsed: ollamaParsed };
    }
  } catch(ollamaErr) {
    console.error('[SA-CV] Ollama fallback error:', ollamaErr.message);
  }

  console.error('[SA-CV] BOTH Gemini and Ollama failed to produce parseable JSON');
  return { error: 'AI parse failed — using original CV', parsed: null };
}

// ─── DOCX Processing ──────────────────────────────────────────────────────────
function xmlEsc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getParaText(paraXml) {
  return (paraXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
    .map(m => m.replace(/<[^>]*>/g, '')).join('');
}

function replaceParaText(paraXml, newText) {
  const pPrMatch = paraXml.match(/<w:pPr[\s\S]*?<\/w:pPr>/);
  const pPr = pPrMatch ? pPrMatch[0] : '';
  const firstRunMatch = paraXml.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/);
  let rPr = '';
  if (firstRunMatch) {
    const rPrMatch = firstRunMatch[0].match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
    if (rPrMatch) rPr = rPrMatch[0];
  }
  if (!newText && newText !== 0) return `<w:p>${pPr}</w:p>`;
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${xmlEsc(String(newText))}</w:t></w:r></w:p>`;
}

function replaceSummary(xml, newSummary) {
  const summaryIdx = xml.search(/PROFESSIONAL[^<]{0,30}SUMMARY/i);
  if (summaryIdx === -1) return xml;
  const headingParaEnd = xml.indexOf('</w:p>', summaryIdx) + '</w:p>'.length;
  const nextParaStart = xml.indexOf('<w:p ', headingParaEnd);
  if (nextParaStart === -1) return xml;
  const nextParaEnd = xml.indexOf('</w:p>', nextParaStart) + '</w:p>'.length;
  const summaryPara = xml.slice(nextParaStart, nextParaEnd);
  return xml.slice(0, nextParaStart) + replaceParaText(summaryPara, newSummary) + xml.slice(nextParaEnd);
}

function replaceSkillsTable(xml, skills) {
  const skillsIdx = xml.search(/(?<![A-Z])SKILLS(?![A-Z])/);
  if (skillsIdx === -1) return xml;
  const tableStart = xml.indexOf('<w:tbl>', skillsIdx);
  if (tableStart === -1) return xml;
  const tableEnd = xml.indexOf('</w:tbl>', tableStart) + '</w:tbl>'.length;
  let tableXml = xml.slice(tableStart, tableEnd);
  let cellIndex = 0;
  tableXml = tableXml.replace(/<w:tc>[\s\S]*?<\/w:tc>/g, (cellXml) => {
    const paraMatch = cellXml.match(/<w:p[ >][\s\S]*?<\/w:p>/);
    if (!paraMatch) { cellIndex++; return cellXml; }
    if (cellIndex % 2 === 0) {
      const skill = skills[Math.floor(cellIndex / 2)] || '';
      cellIndex++;
      return cellXml.replace(/<w:p[ >][\s\S]*?<\/w:p>/, replaceParaText(paraMatch[0], skill));
    } else {
      cellIndex++;
      return cellXml.replace(/<w:p[ >][\s\S]*?<\/w:p>/, replaceParaText(paraMatch[0], ''));
    }
  });
  return xml.slice(0, tableStart) + tableXml + xml.slice(tableEnd);
}

function replaceBulletsAfterTitle(xml, titleText, newBullets) {
  const escaped = titleText.split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]{0,20}');
  const titleIdx = xml.search(new RegExp(escaped, 'i'));
  if (titleIdx === -1) return xml;
  const titleParaEnd = xml.indexOf('</w:p>', titleIdx) + '</w:p>'.length;

  let current = titleParaEnd;
  let bulletCount = 0;
  const parts = [xml.slice(0, titleParaEnd)];
  const SECTION_STOP = /^(WORK HISTORY|EDUCATION|SKILLS|LINKEDIN|HOBBIES|PROFESSIONAL SUMMARY|CARLTON|CONTACT)/i;

  while (bulletCount < newBullets.length && current < xml.length) {
    const nextParaStart = xml.indexOf('<w:p ', current);
    if (nextParaStart === -1) break;
    const nextParaEnd = xml.indexOf('</w:p>', nextParaStart) + '</w:p>'.length;
    const paraXml = xml.slice(nextParaStart, nextParaEnd);
    const paraText = getParaText(paraXml).trim();

    if (paraText.length > 0 && paraText.length < 60 && SECTION_STOP.test(paraText)) break;
    const nextTitles = ['Operations Expert', 'Dispatcher', 'Empire', 'Teleperformance'];
    if (bulletCount > 0 && nextTitles.some(t => paraText.includes(t))) break;

    if (nextParaStart > current) parts.push(xml.slice(current, nextParaStart));
    parts.push(replaceParaText(paraXml, newBullets[bulletCount] || ''));
    current = nextParaEnd;
    bulletCount++;
  }

  parts.push(xml.slice(current));
  return parts.join('');
}

function processDocxXml(xml, tailoredData) {
  let result = xml;
  if (tailoredData.summary) result = replaceSummary(result, tailoredData.summary);
  if (tailoredData.skills?.length) result = replaceSkillsTable(result, tailoredData.skills);
  if (tailoredData.teleperformance_bullets?.length)
    result = replaceBulletsAfterTitle(result, 'Operations Expert', tailoredData.teleperformance_bullets);
  if (tailoredData.empire_bullets?.length)
    result = replaceBulletsAfterTitle(result, 'Dispatcher', tailoredData.empire_bullets);
  return result;
}

async function generateDocx(cvId, tailoredData) {
  // PizZip is available after: npm install && npm run build
  let PizZip;
  try {
    const mod = await import('./lib/docx.bundle.mjs');
    PizZip = mod.PizZip || mod.default;
  } catch(e) {
    return null;
  }

  const templateFile = TEMPLATE_MAP[cvId] || TEMPLATE_MAP['customer_support'];
  const templateUrl = chrome.runtime.getURL(`assets/templates/${templateFile}`);
  const resp = await fetch(templateUrl);
  if (!resp.ok) throw new Error(`Template not found: ${templateFile}`);
  const arrayBuffer = await resp.arrayBuffer();

  const zip = new PizZip(arrayBuffer);
  const docXml = zip.file('word/document.xml').asText();
  const modifiedXml = processDocxXml(docXml, tailoredData);
  zip.file('word/document.xml', modifiedXml);

  const output = zip.generate({
    type: 'arraybuffer',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });

  const bytes = new Uint8Array(output);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
