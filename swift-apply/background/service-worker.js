// SwiftApply Background Service Worker
// Handles Gemini API calls and DOCX template processing

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

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
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
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
});

// ─── Gemini API ───────────────────────────────────────────────────────────────
function parseGeminiJSON(text) {
  if (!text) return null;
  let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try { return JSON.parse(cleaned); } catch(e) {}
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch(e) {} }
  // Regex field extraction as last resort
  try {
    const summary = text.match(/"summary"\s*:\s*"([^"]+)"/)?.[1] || '';
    const skillsMatch = text.match(/"skills"\s*:\s*\[([^\]]+)\]/)?.[1] || '';
    const skills = skillsMatch.match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
    const tpMatch = text.match(/"teleperformance_bullets"\s*:\s*\[([^\]]+)\]/)?.[1] || '';
    const tpBullets = tpMatch.match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
    const empMatch = text.match(/"empire_bullets"\s*:\s*\[([^\]]+)\]/)?.[1] || '';
    const empBullets = empMatch.match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
    if (summary && skills.length > 0) {
      return { summary, skills, teleperformance_bullets: tpBullets, empire_bullets: empBullets };
    }
  } catch(e) {}
  return null;
}

async function callGeminiAPI(fullPrompt, apiKey, maxTokens = 1000, systemInstruction = null) {
  const url = `${GEMINI_API_URL}?key=${apiKey}`;
  const generationConfig = { temperature: 0.4, maxOutputTokens: maxTokens, topP: 0.8, topK: 40 };
  if (systemInstruction) {
    generationConfig.responseMimeType = "application/json";
  }
  const body = {
    contents: [{ parts: [{ text: fullPrompt }] }],
    generationConfig
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini API error ${response.status}`);
  }
  const data = await response.json();
  const inputTokens = data.usageMetadata?.promptTokenCount || 0;
  const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
  console.log(`[SwiftApply TOKENS] Input: ${inputTokens} | Output: ${outputTokens} | Total: ${inputTokens + outputTokens}`);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function handleGeminiApiCall({ systemPrompt, userPrompt }) {
  const { geminiApiKey } = await chrome.storage.sync.get(['geminiApiKey']);
  if (!geminiApiKey) throw new Error("No API key set. Please add your Gemini API key in extension settings.");
  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;
  return await callGeminiAPI(fullPrompt, geminiApiKey, 3000);
}

async function handleTailorCV({ systemPrompt, userPrompt }) {
  const { geminiApiKey } = await chrome.storage.sync.get(['geminiApiKey']);
  if (!geminiApiKey) throw new Error("No API key set.");
  const rawText = await callGeminiAPI(userPrompt, geminiApiKey, 1500, systemPrompt);
  console.log('[SwiftApply CV] Raw first 200:', rawText?.substring(0, 200));
  const parsed = parseGeminiJSON(rawText);
  if (!parsed) {
    console.log('[SwiftApply CV] Parse FAILED. Full:', rawText);
    return { error: "Could not parse CV", parsed: null };
  }
  console.log('[SwiftApply CV] Parse SUCCESS');
  return { parsed };
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
