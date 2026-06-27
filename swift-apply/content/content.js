// SwiftApply Content Script — main entry point injected into every page

(function() {
  'use strict';

  // Prevent double injection
  if (window.__swiftApplyInjected) return;
  window.__swiftApplyInjected = true;

  // ─── State ───────────────────────────────────────────────────────────────────
  let sidebarVisible = false;
  let sidebarEl = null;
  let currentJobData = null;
  let currentScoreResult = null;
  let currentTailoredCV = null;
  let currentCoverLetter = null;
  let jsPDF = null;

  async function loadJsPDF() {
    if (jsPDF) return;
    const mod = await import(chrome.runtime.getURL('lib/jspdf.bundle.mjs'));
    jsPDF = mod.jsPDF || mod.default;
    if (!jsPDF) throw new Error('PDF library not ready — run: npm install && npm run build');
  }

  // ─── Message listener from popup ─────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "TOGGLE_SIDEBAR") {
      toggleSidebar();
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === "GET_JOB_DATA") {
      const data = scrapeJobData();
      sendResponse({ jobData: data });
      return true;
    }
    if (message.type === "AUTOFILL_FORM") {
      autofillPage().then(result => sendResponse({ result }));
      return true;
    }
  });

  // ─── Sidebar toggle ───────────────────────────────────────────────────────────
  function toggleSidebar() {
    if (sidebarVisible) {
      hideSidebar();
    } else {
      showSidebar();
    }
  }

  function showSidebar() {
    if (!sidebarEl) {
      createSidebar();
    }
    sidebarEl.classList.add('sa-visible');
    sidebarVisible = true;

    const body = document.body;
    if (body) {
      body.style.transition = 'margin-right 0.3s ease';
      body.style.marginRight = '420px';
    }

    initSidebarContent();
  }

  function hideSidebar() {
    if (sidebarEl) {
      sidebarEl.classList.remove('sa-visible');
    }
    sidebarVisible = false;
    const body = document.body;
    if (body) {
      body.style.marginRight = '';
    }
  }

  // ─── Sidebar creation ─────────────────────────────────────────────────────────
  function createSidebar() {
    sidebarEl = document.createElement('div');
    sidebarEl.id = 'swiftapply-sidebar';
    sidebarEl.className = 'sa-sidebar';
    sidebarEl.innerHTML = getSidebarHTML();
    document.body.appendChild(sidebarEl);
    attachSidebarEvents();
  }

  function getSidebarHTML() {
    return `
      <div class="sa-sidebar-inner">
        <div class="sa-header">
          <div class="sa-header-left">
            <span class="sa-logo">⚡</span>
            <span class="sa-brand">SwiftApply</span>
          </div>
          <button class="sa-close-btn" id="sa-close">✕</button>
        </div>

        <div class="sa-content" id="sa-content">
          <div class="sa-loading" id="sa-loading">
            <div class="sa-spinner"></div>
            <p>Analysing job posting...</p>
          </div>
        </div>

        <div class="sa-action-bar" id="sa-action-bar" style="display:none">
          <button class="sa-btn sa-btn-primary" id="sa-btn-attach">Generate & Attach CV</button>
          <button class="sa-btn sa-btn-secondary" id="sa-btn-autofill">Auto-Fill</button>
          <button class="sa-btn sa-btn-ghost" id="sa-btn-skip">Skip</button>
        </div>
        <div class="sa-footer-note" id="sa-footer-note" style="display:none;padding:6px 12px;font-size:11px;color:#92400e;background:#fef3c7;border-top:1px solid #fde68a;text-align:center"></div>
      </div>
    `;
  }

  function attachSidebarEvents() {
    sidebarEl.querySelector('#sa-close').addEventListener('click', hideSidebar);

    sidebarEl.addEventListener('click', (e) => {
      const id = e.target.id || e.target.closest('[id]')?.id;

      if (id === 'sa-btn-attach') handleAttachCV();
      if (id === 'sa-btn-autofill') handleAutofill();
      if (id === 'sa-btn-skip') hideSidebar();
      if (id === 'sa-tab-score') showTab('score');
      if (id === 'sa-tab-cv') showTab('cv');
      if (id === 'sa-tab-cover') showTab('cover');
      if (id === 'sa-reload-btn') initSidebarContent();
      if (id === 'sa-open-settings') openSettings();
      if (id === 'sa-copy-cv') copyToClipboard(currentTailoredCV);
      if (id === 'sa-copy-cover') copyToClipboard(currentCoverLetter?.text);
      if (id === 'sa-download-cover') downloadCoverLetter();
      if (id === 'sa-download-docx') downloadDocx();
      if (id === 'sa-regen-cv') regenCV();
      if (id === 'sa-regen-cover') regenCoverLetter();
      if (id === 'sa-generate-cv') handleGenerateCV();
      if (id === 'sa-generate-cover') handleGenerateCover();
      if (id === 'sa-tab-answers') showTab('answers');
      if (id === 'sa-generate-answers') handleGenerateAnswers();
      if (id === 'sa-regen-answers') handleGenerateAnswers();
      const copyAnswerBtn = e.target.closest('.sa-copy-answer');
      if (copyAnswerBtn) {
        navigator.clipboard.writeText(copyAnswerBtn.dataset.answer);
        showToast('Answer copied');
      }
    });
  }

  function cleanCoverLetter(text) {
    if (!text) return text;
    text = text.replace(/\s*—\s*/g, ', ');
    text = text.replace(/^(Dear|To|Hello|Hi)[^\n]*\n+/im, '');
    text = text.replace(/\n+(Regards|Sincerely|Best|Yours|Kind regards|With regards|Carlton|Warm)[^\n]*/gi, '');
    return text.trim();
  }

  // ─── Sidebar content loading ──────────────────────────────────────────────────
  async function initSidebarContent() {
    showLoading("Analysing job posting...");

    try {
      currentJobData = scrapeJobData();

      if (!currentJobData.description || currentJobData.description.length < 100) {
        showError("Could not read the job description. Try scrolling to load the full page, then click reload.");
        return;
      }

      currentScoreResult = scoreJob(currentJobData);

      // Render score tab immediately — no waiting
      renderJobHeader(currentJobData, currentScoreResult);
      renderScoreTab(currentScoreResult);
      showTab('score');
      showActionBar(currentScoreResult);

      // Show placeholders — Gemini only called on user action
      const cvPanel = document.getElementById('sa-panel-cv');
      const coverPanel = document.getElementById('sa-panel-cover');
      if (cvPanel) cvPanel.innerHTML = `
        <div class="sa-cv-placeholder">
          <p>CV not yet tailored for this role</p>
          <button class="sa-btn sa-btn-primary" id="sa-generate-cv">✨ Generate Tailored CV</button>
        </div>`;
      if (coverPanel) coverPanel.innerHTML = `
        <div class="sa-cover-placeholder">
          <p>Cover letter not yet written for this role</p>
          <button class="sa-btn sa-btn-primary" id="sa-generate-cover">✨ Generate Cover Letter</button>
        </div>`;

    } catch (err) {
      showError(`Error: ${err.message}`);
    }
  }

  function enableAttachButton() {
    const btn = document.getElementById('sa-btn-attach');
    if (!btn) return;
    const isLinkedIn = window.location.hostname.includes('linkedin.com');
    if (isLinkedIn) return; // LinkedIn mode handled separately
    btn.disabled = false;
    btn.style.opacity = '';
    btn.style.cursor = '';
    btn.textContent = 'Generate & Attach CV';
  }

  // ─── Tab rendering ────────────────────────────────────────────────────────────
  function renderJobHeader(jobData, scoreResult) {
    const content = document.getElementById('sa-content');
    const colour = scoreResult.colour;
    const colourHex = { green: '#22c55e', perfect: '#22c55e', yellow: '#f59e0b', orange: '#f97316', red: '#ef4444', fail: '#ef4444' }[colour] || '#6b7280';
    const autoFailBanner = scoreResult.autoFail
      ? `<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:6px;padding:8px 10px;margin:8px 0;color:#b91c1c;font-size:12px">${(scoreResult.flags || [scoreResult.autoFailReason]).map(f => `<div style="display:flex;gap:6px;align-items:flex-start;margin-bottom:2px"><span>⛔</span><span>${escHtml(f)}</span></div>`).join('')}</div>`
      : '';

    content.innerHTML = `
      <div class="sa-job-header">
        <div class="sa-job-title">${escHtml(jobData.title || 'Untitled Role')}</div>
        <div class="sa-job-meta">
          <span class="sa-company">${escHtml(jobData.company || 'Unknown company')}</span>
          ${jobData.location ? `<span class="sa-dot">·</span><span class="sa-location">${escHtml(jobData.location)}</span>` : ''}
          ${jobData.salary ? `<span class="sa-dot">·</span><span class="sa-salary">${escHtml(jobData.salary)}</span>` : ''}
        </div>
        ${autoFailBanner}
        <div class="sa-score-badge" style="border-color: ${colourHex}; color: ${colourHex}">
          <span class="sa-score-number">${scoreResult.score}</span>
          <span class="sa-score-label">/100</span>
          <span class="sa-score-rec">${scoreResult.recommendation}</span>
        </div>

        <div class="sa-score-bar-bg">
          <div class="sa-score-bar-fill" style="width: ${scoreResult.score}%; background: ${colourHex}"></div>
        </div>
      </div>

      <div class="sa-tabs">
        <button class="sa-tab sa-tab-active" id="sa-tab-score">Match</button>
        <button class="sa-tab" id="sa-tab-cv">CV</button>
        <button class="sa-tab" id="sa-tab-cover">Cover Letter</button>
        <button class="sa-tab" id="sa-tab-answers" data-tab="answers">Answers</button>
      </div>

      <div class="sa-tab-panels">
        <div class="sa-panel" id="sa-panel-score"></div>
        <div class="sa-panel sa-panel-hidden" id="sa-panel-cv">
          <div class="sa-generating">
            <div class="sa-spinner sa-spinner-sm"></div>
            Tailoring CV with AI...
          </div>
        </div>
        <div class="sa-panel sa-panel-hidden" id="sa-panel-cover">
          <div class="sa-generating">
            <div class="sa-spinner sa-spinner-sm"></div>
            Writing cover letter...
          </div>
        </div>
        <div class="sa-panel sa-panel-hidden" id="sa-panel-answers">
          <div class="sa-answers-placeholder">
            <p>Pre-generate answers to common screening questions for this role</p>
            <button class="sa-btn sa-btn-primary" id="sa-generate-answers">✨ Generate Answers</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderScoreTab(scoreResult) {
    const panel = document.getElementById('sa-panel-score');
    if (!panel) return;

    let html = '';

    if (scoreResult.autoFail) {
      const reasons = scoreResult.flags && scoreResult.flags.length ? scoreResult.flags : [scoreResult.autoFailReason];
      html += `<div class="sa-autofail-detail">${reasons.map(f => `<div>⛔ <strong>${escHtml(f)}</strong></div>`).join('')}<span class="sa-autofail-sub">This job has been automatically filtered out. Consider skipping.</span></div>`;
    }

    html += `
      <div class="sa-cv-selected">
        <span class="sa-cv-icon">📄</span>
        <div>
          <div class="sa-cv-name">${escHtml(scoreResult.cvSelection.cvName)}</div>
          <div class="sa-cv-reason">${escHtml(scoreResult.cvSelection.reason)}</div>
        </div>
      </div>
    `;

    if (scoreResult.estimatedTime) {
      html += `<div class="sa-meta-line">⏱ Est. application time: ${escHtml(scoreResult.estimatedTime)}</div>`;
    }

    if (scoreResult.locationNote) {
      html += `<div class="sa-meta-line">📍 ${escHtml(scoreResult.locationNote)}</div>`;
    }

    const positives = scoreResult.positiveMatches.slice(0, 3);
    const negatives = scoreResult.negativeMatches.filter(n => n.points !== 0).slice(0, 3);

    if (positives.length > 0) {
      html += `<div class="sa-signal-section">`;
      html += positives.map(p => `<div class="sa-signal sa-positive">✓ ${escHtml(p.message)}</div>`).join('');
      html += `</div>`;
    }

    if (negatives.length > 0) {
      html += `<div class="sa-signal-section">`;
      html += negatives.map(n => `<div class="sa-signal sa-negative">✗ ${escHtml(n.message)}</div>`).join('');
      html += `</div>`;
    }

    if (scoreResult.redFlags && scoreResult.redFlags.length > 0) {
      html += `<div class="sa-signal-section">`;
      html += scoreResult.redFlags.map(f => `<div class="sa-signal sa-warning">⚠ ${escHtml(f)}</div>`).join('');
      html += `</div>`;
    }

    panel.innerHTML = html;
  }

  function renderCVTab(tailoredCV, cvSelection) {
    const panel = document.getElementById('sa-panel-cv');
    if (!panel) return;

    if (tailoredCV.error && !tailoredCV.tailored) {
      panel.innerHTML = `
        <div class="sa-api-notice">
          <p>⚠️ ${escHtml(tailoredCV.error || 'CV tailoring unavailable')}</p>
          ${tailoredCV.error?.includes('API key') ? `<button class="sa-btn sa-btn-secondary sa-btn-sm" id="sa-open-settings">Add API Key</button>` : `<button class="sa-btn sa-btn-ghost sa-btn-sm" id="sa-reload-btn">Retry</button>`}
        </div>
        <div class="sa-cv-preview">${renderCVContent(tailoredCV)}</div>
      `;
      return;
    }

    panel.innerHTML = `
      <div class="sa-cv-toolbar">
        <span class="sa-cv-badge ${tailoredCV.tailored ? 'sa-badge-ai' : 'sa-badge-base'}">
          ${tailoredCV.tailored ? '✨ AI Tailored' : '📄 Base CV'}
        </span>
        <div class="sa-cv-toolbar-btns">
          <button class="sa-btn sa-btn-ghost sa-btn-sm" id="sa-regen-cv">Regenerate</button>
          <button class="sa-btn sa-btn-ghost sa-btn-sm" id="sa-copy-cv">Copy</button>
          ${tailoredCV.docxBase64 ? `<button class="sa-btn sa-btn-secondary sa-btn-sm" id="sa-download-docx">⬇ DOCX</button>` : ''}
        </div>
      </div>
      <div class="sa-cv-preview">${renderCVContent(tailoredCV)}</div>
    `;
  }

  function renderCVContent(cv) {
    const skillsBullets = (cv.skills || []).slice(0, 5).map(s => `<li>${escHtml(s)}</li>`).join('');

    let expHtml = '';
    for (const exp of (cv.experience || [])) {
      const headerParts = [exp.title, exp.company, exp.location, exp.dates].filter(Boolean).map(escHtml);
      expHtml += `
        <div class="sa-exp-item">
          <div class="sa-exp-header">${headerParts.join(' · ')}</div>
          <ul class="sa-bullets">${(exp.bullets || []).map(b => `<li>${escHtml(b)}</li>`).join('')}</ul>
        </div>
      `;
    }

    return `
      <div class="sa-cv-doc">
        <div class="sa-cv-name-header">CARLTON DZINGIRA</div>
        <div class="sa-cv-contact">Warsaw, Poland · +48577327906 · fredrickcarlton@gmail.com</div>
        <div class="sa-cv-section">
          <div class="sa-cv-section-title">SUMMARY</div>
          <p class="sa-cv-summary">${escHtml(cv.summary || '')}</p>
        </div>
        <div class="sa-cv-section">
          <div class="sa-cv-section-title">SKILLS</div>
          <ul class="sa-bullets sa-skills-bullets">${skillsBullets}</ul>
        </div>
        <div class="sa-cv-section">
          <div class="sa-cv-section-title">EXPERIENCE</div>
          ${expHtml}
        </div>
        <div class="sa-cv-section">
          <div class="sa-cv-section-title">EDUCATION</div>
          <p class="sa-cv-education">${escHtml(cv.education || '')}</p>
        </div>
      </div>
    `;
  }

  function renderCoverTab(coverLetter) {
    const panel = document.getElementById('sa-panel-cover');
    if (!panel) return;

    if (coverLetter.error && !coverLetter.generated) {
      panel.innerHTML = `
        <div class="sa-api-notice">
          <p>⚠️ ${escHtml(coverLetter.error)}</p>
          ${coverLetter.error?.includes('API key') ? `<button class="sa-btn sa-btn-secondary sa-btn-sm" id="sa-open-settings">Add API Key</button>` : `<button class="sa-btn sa-btn-ghost sa-btn-sm" id="sa-reload-btn">Retry</button>`}
        </div>
        <div class="sa-cover-text">${escHtml(coverLetter.text || '')}</div>
      `;
      return;
    }

    panel.innerHTML = `
      <div class="sa-cv-toolbar">
        <span class="sa-cv-badge ${coverLetter.generated ? 'sa-badge-ai' : 'sa-badge-base'}">
          ${coverLetter.generated ? '✨ AI Generated' : '📄 Template'}
        </span>
        <div class="sa-cv-toolbar-btns">
          <button class="sa-btn sa-btn-ghost sa-btn-sm" id="sa-regen-cover">Regenerate</button>
          <button class="sa-btn sa-btn-ghost sa-btn-sm" id="sa-copy-cover">Copy</button>
          <button class="sa-btn sa-btn-secondary sa-btn-sm" id="sa-download-cover">⬇ Download</button>
        </div>
      </div>
      <div class="sa-cover-text">${escHtml(coverLetter.text || '')}</div>
    `;
  }

  // ─── Tab switching ────────────────────────────────────────────────────────────
  function showTab(tabName) {
    const tabs = sidebarEl?.querySelectorAll('.sa-tab');
    const panels = sidebarEl?.querySelectorAll('.sa-panel');
    if (!tabs || !panels) return;

    tabs.forEach(t => t.classList.remove('sa-tab-active'));
    panels.forEach(p => p.classList.add('sa-panel-hidden'));

    const activeTab = sidebarEl.querySelector(`#sa-tab-${tabName}`);
    const activePanel = sidebarEl.querySelector(`#sa-panel-${tabName}`);
    if (activeTab) activeTab.classList.add('sa-tab-active');
    if (activePanel) activePanel.classList.remove('sa-panel-hidden');
  }

  // ─── Actions ──────────────────────────────────────────────────────────────────

  // Auto-Fill — only fills form fields, nothing else
  async function handleAutofill() {
    const btn = document.getElementById('sa-btn-autofill');
    if (btn) { btn.textContent = 'Filling...'; btn.disabled = true; }
    try {
      const result = await autofillPage();
      showToast(`Form filled — review before submitting`);
    } catch (err) {
      showToast(`Autofill error: ${err.message}`, 'error');
    }
    if (btn) { btn.textContent = 'Auto-Fill'; btn.disabled = false; }
  }

  async function handleAttachCV() {
    if (window.location.hostname.includes('linkedin.com')) {
      downloadDocx();
      return;
    }
    const cvData = currentTailoredCV || getBaseCV(currentScoreResult?.cvSelection?.cvId || 'customer_support');
    const btn = document.getElementById('sa-btn-attach');
    if (btn) { btn.textContent = 'Generating PDF...'; btn.disabled = true; }
    try {
      const blob = await generateCVPDF(cvData);
      const jobTitle = (currentJobData?.title || 'role').replace(/[^a-z0-9]/gi, '_').slice(0, 40);
      const filename = `Carlton_Dzingira_CV_${jobTitle}.pdf`;
      const file = new File([blob], filename, { type: 'application/pdf' });
      const fileInput = document.querySelector('input[type="file"][accept*="pdf"], input[type="file"][accept*="doc"], input[type="file"]');
      if (fileInput) {
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        fileInput.dispatchEvent(new Event('input', { bubbles: true }));
        showToast('CV attached — review and submit');
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
        showToast('CV downloaded as PDF');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
    if (btn) { btn.textContent = 'Generate & Attach CV'; btn.disabled = false; }
  }

  async function generateCVPDF(cv) {
    await loadJsPDF();
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = 210;
    const margin = 20;
    const contentW = pageW - margin * 2;
    let y = 12;

    function sectionLine(yPos) {
      doc.setDrawColor(0);
      doc.setLineWidth(0.3);
      doc.line(margin, yPos, pageW - margin, yPos);
    }

    // NAME
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('CARLTON DZINGIRA', pageW / 2, y, { align: 'center' });
    y += 6;

    // CONTACT — plain ASCII separators, no unicode
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const contact = 'Warsaw, 02-685 Poland  |  +48577327906  |  fredrickcarlton@gmail.com';
    doc.text(contact, pageW / 2, y, { align: 'center' });
    y += 4;
    sectionLine(y);
    y += 4;

    // PROFESSIONAL SUMMARY
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('PROFESSIONAL SUMMARY', margin, y);
    y += 3;
    sectionLine(y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const summaryLines = doc.splitTextToSize(cv.summary || '', contentW);
    doc.text(summaryLines, margin, y);
    y += summaryLines.length * 3.8 + 4;

    // SKILLS — single column vertical list
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('SKILLS', margin, y);
    y += 3;
    sectionLine(y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const skills = (cv.skills || []).slice(0, 5);
    for (const skill of skills) {
      doc.text('-  ' + skill, margin + 3, y);
      y += 4.5;
    }
    y += 3;

    // WORK HISTORY
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('WORK HISTORY', margin, y);
    y += 3;
    sectionLine(y);
    y += 4;

    for (const exp of (cv.experience || [])) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(exp.title || '', margin, y);
      doc.text(exp.dates || '', pageW - margin, y, { align: 'right' });
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text((exp.company || '') + ' - ' + (exp.location || ''), margin, y);
      y += 4;
      for (const bullet of (exp.bullets || [])) {
        const bulletLines = doc.splitTextToSize('-  ' + bullet, contentW - 10);
        if (y + bulletLines.length * 4.5 > 280) {
          doc.addPage();
          y = 15;
        }
        doc.text(bulletLines, margin + 3, y);
        y += bulletLines.length * 4.2 + 0.5;
      }
      y += 4;
    }

    // EDUCATION
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('EDUCATION', margin, y);
    y += 3;
    sectionLine(y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const eduLine = cv.education || 'Bachelor of Science: Computer Engineering';
    const cleanEdu = eduLine.includes('Vistula') ? eduLine : eduLine + ' - Vistula University, Warsaw, Poland';
    const eduLines = doc.splitTextToSize(cleanEdu, contentW);
    doc.text(eduLines, margin, y);
    y += eduLines.length * 4 + 5;

    // LINKEDIN
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('LINKEDIN', margin, y);
    y += 3;
    sectionLine(y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('linkedin.com/in/carlton-dzingira-694253231', margin, y);

    return doc.output('blob');
  }

  async function generateCoverLetterPDF(text) {
    await loadJsPDF();
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const margin = 25;
    let y = 25;
    const pageWidth = 210 - margin * 2;

    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('Carlton Dzingira', 105, y, { align: 'center' }); y += 6;

    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text('Warsaw, Poland  |  +48577327906  |  fredrickcarlton@gmail.com', 105, y, { align: 'center' });
    y += 12;

    doc.setFontSize(10);
    for (const para of text.split(/\n\n+/)) {
      const lines = doc.splitTextToSize(para.trim(), pageWidth);
      if (y + lines.length * 5 > 270) { doc.addPage(); y = 25; }
      doc.text(lines, margin, y); y += lines.length * 5 + 6;
    }

    return doc.output('blob');
  }

  async function downloadDocx() {
    const cvData = currentTailoredCV || getBaseCV(currentScoreResult?.cvSelection?.cvId || 'customer_support');
    const jobTitle = (currentJobData?.title || 'role').replace(/[^a-z0-9]/gi, '_').slice(0, 40);
    showToast('Generating PDF...');
    try {
      const blob = await generateCVPDF(cvData);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Carlton_Dzingira_CV_${jobTitle}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('CV downloaded as PDF');
    } catch(err) {
      showToast('PDF error: ' + err.message, 'error');
    }
  }

  async function downloadCoverLetter() {
    if (!currentCoverLetter?.text) {
      showToast('Cover letter not ready yet', 'info');
      return;
    }
    const jobTitle = (currentJobData?.title || 'role').replace(/[^a-z0-9]/gi, '_').slice(0, 40);
    const company = (currentJobData?.company || 'company').replace(/[^a-z0-9]/gi, '_').slice(0, 30);
    const filename = `CoverLetter_${company}_${jobTitle}.pdf`;
    showToast('Generating PDF...');
    try {
      const blob = await generateCoverLetterPDF(currentCoverLetter.text);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      showToast('Cover letter downloaded as PDF');
    } catch(err) {
      showToast(`PDF error: ${err.message}`, 'error');
    }
  }

  function downloadCV() {
    if (!currentTailoredCV) {
      showToast('CV not ready yet — wait for tailoring to finish', 'info');
      return;
    }
    const cvText = formatCVAsText(currentTailoredCV);
    const jobTitle = (currentJobData?.title || 'role').replace(/[^a-z0-9]/gi, '_').slice(0, 40);
    const filename = `Carlton_Dzingira_CV_${jobTitle}.txt`;
    const blob = new Blob([cvText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CV downloaded — attach it to your LinkedIn application');
  }

  async function regenCV() {
    if (!currentJobData) return;
    if (currentTailoredCV?.tailored) {
      renderCVTab(currentTailoredCV, currentScoreResult.cvSelection);
      showToast('Showing current tailored CV');
      return;
    }
    const panel = document.getElementById('sa-panel-cv');
    if (panel) panel.innerHTML = '<div class="sa-generating"><div class="sa-spinner sa-spinner-sm"></div>Retailoring CV...</div>';
    currentTailoredCV = await tailorCV(
      currentScoreResult.cvSelection.cvId,
      currentJobData,
      currentScoreResult.category
    ).catch(err => ({ error: err.message, tailored: false }));
    renderCVTab(currentTailoredCV, currentScoreResult.cvSelection);
  }

  async function regenCoverLetter() {
    if (!currentJobData) return;
    const panel = document.getElementById('sa-panel-cover');
    if (panel) panel.innerHTML = `<div class="sa-generating"><div class="sa-spinner sa-spinner-sm"></div>Rewriting cover letter...</div>`;

    const raw = await generateCoverLetter(currentJobData, currentScoreResult.cvSelection.cvId, currentScoreResult.category)
      .catch(err => ({ error: err.message, generated: false }));
    currentCoverLetter = { ...raw, text: cleanCoverLetter(raw.text) };
    renderCoverTab(currentCoverLetter);
  }

  async function handleGenerateCV() {
    const panel = document.getElementById('sa-panel-cv');
    if (panel) panel.innerHTML = `<div class="sa-generating"><div class="sa-spinner sa-spinner-sm"></div>Tailoring your CV...</div>`;
    currentTailoredCV = await tailorCV(
      currentScoreResult.cvSelection.cvId,
      currentJobData,
      currentScoreResult.category
    ).catch(err => ({ ...getBaseCV(currentScoreResult.cvSelection.cvId), tailored: false, error: err.message }));
    renderCVTab(currentTailoredCV, currentScoreResult.cvSelection);
    if (currentTailoredCV?.tailored) enableAttachButton();
  }

  async function handleGenerateCover() {
    const panel = document.getElementById('sa-panel-cover');
    if (panel) panel.innerHTML = `<div class="sa-generating"><div class="sa-spinner sa-spinner-sm"></div>Writing your cover letter...</div>`;
    const raw = await generateCoverLetter(
      currentJobData,
      currentScoreResult.cvSelection.cvId,
      currentScoreResult.category
    ).catch(err => ({ text: '', generated: false, error: err.message }));
    currentCoverLetter = { ...raw, text: cleanCoverLetter(raw.text) };
    renderCoverTab(currentCoverLetter);
  }

  function openSettings() {
    chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
  }

  function copyToClipboard(text) {
    if (!text) return;
    let copyText = text;
    if (typeof text === 'object') {
      copyText = formatCVAsText(text);
    }
    navigator.clipboard.writeText(copyText)
      .then(() => showToast('Copied to clipboard!'))
      .catch(() => showToast('Copy failed — try selecting text manually', 'error'));
  }

  function formatCVAsText(cv) {
    const lines = [
      "CARLTON DZINGIRA",
      "Warsaw, Poland | +48577327906 | fredrickcarlton@gmail.com",
      "",
      "PROFESSIONAL SUMMARY",
      cv.summary || "",
      "",
      "SKILLS",
      (cv.skills || []).join(" · "),
      "",
      "EXPERIENCE"
    ];
    for (const exp of (cv.experience || [])) {
      lines.push(`${exp.title} | ${exp.company}, ${exp.location} | ${exp.dates}`);
      (exp.bullets || []).forEach(b => lines.push(`• ${b}`));
      lines.push("");
    }
    lines.push("EDUCATION");
    lines.push(cv.education || "");
    return lines.join("\n");
  }

  // ─── UI helpers ───────────────────────────────────────────────────────────────
  function showLoading(message, fullscreen = true) {
    if (!sidebarEl) return;
    const content = document.getElementById('sa-content');
    if (fullscreen && content) {
      content.innerHTML = `
        <div class="sa-loading">
          <div class="sa-spinner"></div>
          <p>${escHtml(message)}</p>
        </div>
      `;
    }
  }

  function showError(message) {
    const content = document.getElementById('sa-content');
    if (content) {
      content.innerHTML = `
        <div class="sa-error">
          <div class="sa-error-icon">⚠️</div>
          <p>${escHtml(message)}</p>
          <button class="sa-btn sa-btn-secondary" id="sa-reload-btn">Try Again</button>
        </div>
      `;
    }
  }

  function showActionBar(scoreResult) {
    const bar = document.getElementById('sa-action-bar');
    if (!bar) return;
    bar.style.display = 'flex';

    const isLinkedIn = window.location.hostname.includes('linkedin.com');
    const attachBtn = document.getElementById('sa-btn-attach');
    const autofillBtn = document.getElementById('sa-btn-autofill');
    const footerNote = document.getElementById('sa-footer-note');

    if (isLinkedIn) {
      // LinkedIn: attach becomes "Download CV", autofill disabled
      if (attachBtn) {
        attachBtn.textContent = 'Download CV';
        attachBtn.disabled = false;
        attachBtn.style.opacity = '';
        attachBtn.style.cursor = '';
      }
      if (autofillBtn) {
        autofillBtn.disabled = true;
        autofillBtn.style.opacity = '0.4';
        autofillBtn.style.cursor = 'not-allowed';
        autofillBtn.title = 'Auto-fill not available on LinkedIn';
      }
      if (footerNote) { footerNote.style.display = 'block'; footerNote.textContent = '⚠ LinkedIn — manual apply mode'; }
    }

    if (scoreResult && scoreResult.autoFail) {
      if (attachBtn) { attachBtn.disabled = true; attachBtn.style.opacity = '0.4'; attachBtn.style.cursor = 'not-allowed'; }
      if (!isLinkedIn && autofillBtn) { autofillBtn.disabled = true; autofillBtn.style.opacity = '0.4'; autofillBtn.style.cursor = 'not-allowed'; }
    }
  }

  function showToast(message, type = 'success') {
    const existing = document.getElementById('sa-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'sa-toast';
    toast.className = `sa-toast sa-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('sa-toast-visible'), 10);
    setTimeout(() => {
      toast.classList.remove('sa-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\n/g, '<br>');
  }

  // ─── Inline functions (self-contained — no ES module imports in content scripts) ──

  function scrapeJobData() {
    const SITE_CONFIGS = {
      "indeed.com": {
        title: ["[data-testid='jobsearch-JobInfoHeader-title']", "h1.jobTitle", "h1[class*='title']"],
        company: ["[data-testid='inlineHeader-companyName']", "[class*='companyName']"],
        location: [
          "[data-testid='job-location']",
          "[data-testid='inlineHeader-companyLocation']",
          ".jobsearch-JobInfoHeader-whereAndWhen",
          ".jobLocation",
          "[class*='jobLocation']",
          ".css-6z3gkf",
          ".css-t3xrds",
          "[class*='companyLocation']"
        ],
        description: ["#jobDescriptionText", "[class*='jobDescription']"],
        salary: ["[class*='salary']"]
      },
      "glassdoor.com": {
        title: ["[data-test='job-title']", "h1[class*='title']", "h1[class*='JobTitle']"],
        company: ["[data-test='employer-name']", "[class*='employerName']"],
        location: ["[data-test='location']", "[class*='location']"],
        description: ["[class*='jobDescriptionContent']", "[data-test='jobDescriptionContent']"],
        salary: ["[data-test='detailSalary']"]
      },
      "linkedin.com": {
        title: [".job-details-jobs-unified-top-card__job-title", "h1"],
        company: [".job-details-jobs-unified-top-card__company-name"],
        location: [
          ".job-details-jobs-unified-top-card__job-insight span",
          ".topcard__flavor--bullet",
          ".jobs-unified-top-card__bullet",
          ".jobs-unified-top-card__workplace-type",
          "[class*='topcard__flavor']",
          ".tvm__text",
          ".job-details-jobs-unified-top-card__bullet"
        ],
        description: [".jobs-description__content", "#job-details"],
        salary: [".jobs-salary"]
      },
      "hiring.cafe": {
        title: ["h1", ".job-title"],
        company: [".company-name", "[class*='company']"],
        location: [".location", "[class*='location']"],
        description: [".job-description", "article", "main"],
        salary: [".salary", "[class*='salary']"]
      },
      "pracuj.pl": {
        title: ["h1[data-test='text-positionName']", "h1"],
        company: ["[data-test='text-employerName']"],
        location: [
          "[data-test='text-region']",
          "[data-test='text-workplaces']",
          "[data-test='text-workLocationCity']",
          ".listing__location"
        ],
        description: ["[data-test='section-description']", ".offer-description"],
        salary: ["[data-test='text-salary']"]
      }
    };

    const hostname = window.location.hostname.toLowerCase();
    let config = null;
    for (const [site, cfg] of Object.entries(SITE_CONFIGS)) {
      if (hostname.includes(site)) { config = cfg; break; }
    }

    const trySelectors = (selectors) => {
      for (const sel of selectors) {
        try {
          const el = document.querySelector(sel);
          if (el && el.textContent.trim()) return el.textContent.trim();
        } catch(e) {}
      }
      return "";
    };

    const genericTitle = ["h1", ".job-title", "[class*='jobTitle']", "[itemprop='title']"];
    const genericCompany = [
      ".company-name", ".employer-name", ".organization", "[data-company]",
      "[itemprop='hiringOrganization'] [itemprop='name']", "[itemprop='hiringOrganization']",
      ".top-card-layout__company-name", ".topcard__org-name-link",
      ".jobsearch-CompanyInfoWithoutHeaderImage", "[data-testid='inlineHeader-companyName']",
      ".employerName", ".company", ".employer", "[class*='companyName']", "[class*='company']"
    ];
    const genericLocation = [
      "[itemprop='jobLocation']",
      "[itemprop='addressLocality']",
      "[data-testid='job-location']",
      "[data-testid='inlineHeader-companyLocation']",
      ".jobLocation",
      "[class*='jobLocation']",
      "[class*='location']",
      "[class*='Location']",
      "[id*='location']",
      ".location"
    ];
    const genericDescription = [".job-description", ".description", "[class*='jobDescription']", "article", "main"];
    const genericSalary = [".salary", "[class*='salary']", "[class*='compensation']"];

    const title = trySelectors(config?.title || genericTitle) || document.title.split(/[-|–]/)[0].trim();

    // FIX 4: Enhanced company extraction with meta tags, JSON-LD, and page title fallback
    function extractCompany() {
      const fromSelectors = trySelectors(config?.company || genericCompany);
      if (fromSelectors) return fromSelectors;
      // Try meta tags
      const ogSite = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
      if (ogSite && ogSite.length < 60) return ogSite;
      // Try JSON-LD schema
      try {
        const schemas = document.querySelectorAll('script[type="application/ld+json"]');
        for (const s of schemas) {
          const data = JSON.parse(s.textContent);
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
            if (item['@type'] === 'JobPosting' && item.hiringOrganization?.name) return item.hiringOrganization.name;
          }
        }
      } catch(e) {}
      // Try page title — often "Job Title at Company Name | Site"
      const titleParts = document.title.split(/\s+at\s+|\s*[-|–]\s*/);
      if (titleParts.length >= 2) {
        const candidate = titleParts[1].trim();
        if (candidate.length > 1 && candidate.length < 60 && !/indeed|linkedin|glassdoor|pracuj|jobs|careers/i.test(candidate)) return candidate;
      }
      // URL domain fallback — e.g. circlek.com → "Circle K", nielseniq.com → "NielsenIQ"
      try {
        const KNOWN_BRANDS = {
          'circlek': 'Circle K', 'nielseniq': 'NielsenIQ', 'dsv': 'DSV',
          'allegro': 'Allegro', 'pkn': 'PKN Orlen', 'orlen': 'Orlen',
          'ing': 'ING', 'bnpparibas': 'BNP Paribas', 'santander': 'Santander',
          'kpmg': 'KPMG', 'pwc': 'PwC', 'ey': 'EY', 'deloitte': 'Deloitte',
          'accenture': 'Accenture', 'capgemini': 'Capgemini', 'infosys': 'Infosys',
          'cognizant': 'Cognizant', 'teleperformance': 'Teleperformance',
          'conduent': 'Conduent', 'concentrix': 'Concentrix', 'transcom': 'Transcom',
          'philips': 'Philips', 'nokia': 'Nokia', 'sap': 'SAP', 'oracle': 'Oracle',
          'ibm': 'IBM', 'hpe': 'HPE', 'dhl': 'DHL', 'ups': 'UPS', 'fedex': 'FedEx',
          'lpp': 'LPP', 'ccc': 'CCC', 'mbank': 'mBank', 'pekao': 'Pekao',
          'datagroup': 'Datagroup', 'asseco': 'Asseco', 'comarch': 'Comarch'
        };
        const rawHostname = window.location.hostname.toLowerCase()
          .replace(/^(www|careers|jobs|apply|hiring|work|talent|hr|join)\./i, '');
        const domain = rawHostname.split('.')[0];
        if (domain && domain.length > 1 && !/indeed|linkedin|glassdoor|pracuj|nofluffjobs|justjoin|monster|ziprecruiter/i.test(domain)) {
          if (KNOWN_BRANDS[domain]) return KNOWN_BRANDS[domain];
          const name = domain.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          return name.length <= 4 ? name.toUpperCase() : name;
        }
      } catch(e) {}
      return "";
    }
    const company = extractCompany();
    let location = trySelectors(config?.location || genericLocation);
    // Location fallback: try page title for "city, country" patterns
    if (!location) {
      const titleLoc = document.title.match(/\b(warsaw|kraków|wrocław|gdańsk|poznań|łódź|katowice|masovian|mazowieckie)\b/i);
      if (titleLoc) location = titleLoc[0];
    }
    const salary = trySelectors(config?.salary || genericSalary);

    let description = "";
    for (const sel of (config?.description || genericDescription)) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const text = (el.innerText || el.textContent || "").trim();
          if (text.length > 200) { description = text; break; }
        }
      } catch(e) {}
    }
    if (!description) {
      const candidates = document.querySelectorAll("div, section, article");
      let longest = "";
      for (const el of candidates) {
        const text = (el.innerText || el.textContent || "").trim();
        if (text.length > longest.length && text.length < 20000) {
          if (/responsibilit|requirement|qualif|experience|skills/i.test(text)) longest = text;
        }
      }
      description = longest;
    }

    return {
      title: title.replace(/\s+/g, ' ').trim(),
      company: company.replace(/\s+/g, ' ').trim(),
      location: location.replace(/\s+/g, ' ').trim(),
      salary: salary.replace(/\s+/g, ' ').trim(),
      description,
      url: window.location.href,
      scrapedAt: new Date().toISOString()
    };
  }

  function scoreJob(jobData) {
    const ROLE_CATEGORIES = {
      it_support: [
        "it support", "help desk", "helpdesk", "technical support", "tech support",
        "it analyst", "service desk", "desktop support", "end user support",
        "it technician", "systems support", "it specialist",
        "it risk analyst", "risk analyst", "it risk"
      ],
      security: [
        "security analyst", "security engineer", "cybersecurity", "information security",
        "it security", "cloud security", "soc analyst", "security operations", "infosec"
      ],
      qa: ["game tester", "qa tester", "quality assurance", "software tester", "test analyst", "qa analyst", "quality analyst"],
      customer_support: [
        "customer support", "customer service", "customer care", "support agent",
        "support representative", "customer representative", "support specialist",
        "client support", "consumer support", "chat support", "email support"
      ],
      operations: [
        "operations expert", "operations coordinator", "operations specialist",
        "operations analyst", "platform operations", "operations administrator",
        "procurement specialist", "procurement coordinator", "purchasing specialist",
        "purchasing coordinator", "category manager", "sourcing specialist",
        "indirect procurement", "supplier management",
        "project coordinator", "project support specialist", "project assistant",
        "project administrator", "program coordinator", "program support",
        "study coordinator", "clinical support specialist",
        "client operations partner", "client solution"
      ],
      admin: [
        "administrative", "admin assistant", "office coordinator", "office administrator",
        "coordinator", "executive assistant", "administrative specialist"
      ],
      dispatcher: ["dispatcher", "logistics coordinator", "logistics", "transport coordinator", "fleet coordinator", "supply chain", "buyer"]
    };

    // FIX 1: Keyword-based CV fallback for unknown categories
    function resolveCV(category, jobText) {
      const CV_MAP = {
        it_support:       { cvId: "it_support",       cvName: "IT Support CV",         reason: "IT/technical role" },
        security:         { cvId: "it_support",       cvName: "IT Support CV",         reason: "Security/tech role" },
        qa:               { cvId: "it_support",       cvName: "IT Support CV",         reason: "QA/Testing role" },
        customer_support: { cvId: "customer_support", cvName: "Customer Support CV",   reason: "Customer-facing role" },
        operations:       { cvId: "operations",       cvName: "Operations / Admin CV", reason: "Operations role" },
        admin:            { cvId: "operations",       cvName: "Operations / Admin CV", reason: "Administrative role" },
        dispatcher:       { cvId: "operations",       cvName: "Operations / Admin CV", reason: "Logistics/dispatch role" },
      };
      if (CV_MAP[category]) return CV_MAP[category];
      // Unknown — scan text for broad signal keywords
      if (/\b(data|engineer|developer|cloud|artificial intelligence|\bai\b|software|sql|python|systems analyst|machine learning|programming|infrastructure|cybersecurity|network|database)\b/i.test(jobText))
        return { cvId: "it_support", cvName: "IT Support CV", reason: "Technical keywords detected" };
      if (/\b(procurement|purchasing|buyer|supply chain|logistics|facilities|office admin|dispatch|warehouse|sourcing|vendor)\b/i.test(jobText))
        return { cvId: "operations", cvName: "Operations / Admin CV", reason: "Operations keywords detected" };
      if (/\b(customer service|customer support|support agent|call cent(re|er)|helpdesk)\b/i.test(jobText))
        return { cvId: "customer_support", cvName: "Customer Support CV", reason: "Customer service role" };
      return { cvId: "customer_support", cvName: "Customer Support CV", reason: "General role — default" };
    }

    const PROFILE_TARGET_ROLES = [
      "it support", "help desk", "helpdesk", "technical support", "tech support",
      "it analyst", "service desk", "security analyst", "cybersecurity", "it risk analyst", "risk analyst",
      "customer support", "customer service", "customer care", "support agent",
      "support representative", "customer representative",
      "operations expert", "operations coordinator", "operations specialist",
      "platform operations", "coordinator", "administrative", "dispatcher",
      "game tester", "qa tester", "quality assurance", "qa analyst"
    ];

    const SKILL_PATTERNS = [
      { pattern: /\b(operations?\s*coord|coordination)\b/i,                              label: "Operations coordination" },
      { pattern: /\b(customer\s*(support|service)|chat\s*support|email\s*support)\b/i,   label: "Customer support" },
      { pattern: /\b(case\s*management|documentation|documenting)\b/i,                   label: "Case management & documentation" },
      { pattern: /\b(troubleshoot|escalat(ion|e))\b/i,                                   label: "Troubleshooting & escalation" },
      { pattern: /\b(compliance|workflow|process\s*(adherence|compliance|driven))\b/i,   label: "Process compliance" },
      { pattern: /\b(kpi|sla|performance\s*targets?|metrics)\b/i,                        label: "KPI/SLA performance" },
      { pattern: /\b(microsoft\s*office|ms\s*office|excel|word|outlook)\b/i,             label: "Microsoft Office" },
      { pattern: /\bwindows\b/i,                                                          label: "Windows" },
      { pattern: /\b(ticketing|ticket\s*system|jira|zendesk|servicenow|freshdesk)\b/i,   label: "Ticketing systems" },
      { pattern: /\b(written\s*comm|english\s*(c1|fluent|proficient|required))\b/i,      label: "Written English" },
      { pattern: /\b(time\s*management|multitask|prioriti[sz])\b/i,                      label: "Time management" },
      { pattern: /\b(it\s*support|help.?desk|technical\s*support)\b/i,                   label: "IT Support basics" },
      { pattern: /\b(vpn|lan|wi.?fi|networking\s*basics?)\b/i,                           label: "VPN/LAN/Wi-Fi basics" },
      { pattern: /\b(microsoft\s*365|ms\s*365|teams|sharepoint)\b/i,                     label: "Microsoft 365 & Teams" },
      { pattern: /\b(risk\s*(assessment|management|analysis))\b/i,                       label: "Risk assessment" },
      { pattern: /\b(stakeholder|client\s*comm|vendor\s*management)\b/i,                 label: "Stakeholder communication" }
    ];

    const WELL_KNOWN_COMPANIES = ["google","microsoft","amazon","meta","apple","ibm","oracle","sap","teleperformance","conduent"];

    const text = `${jobData.title} ${jobData.description}`.toLowerCase();
    const titleText = (jobData.title || "").toLowerCase();
    const locationText = (jobData.location || "").toLowerCase();
    const fullText = `${text} ${locationText} ${jobData.salary || ""}`;

    // ─── Step 1: Auto-Fail Checks ─────────────────────────────────────────────
    const autoFailReasons = [];

    // Language — Polish
    const polishDiacriticCount = (text.match(/[ąęóśźżćń]/g) || []).length;
    const polishDiacriticRatio = text.length > 0 ? polishDiacriticCount / text.length : 0;
    const hasPolishKeywords = /\b(wymagania|obowi[aą]zki|stanowisko|do[sś]wiadczenie|oferujemy)\b/i.test(text);
    if (polishDiacriticRatio > 0.03 || hasPolishKeywords) {
      autoFailReasons.push("Polish-only job posting");
    }

    // Language — other non-English
    if (!autoFailReasons.length) {
      const nonEnglish = [
        { pattern: /\b(stelle|anforderungen|erfahrung)\b/i, lang: "German" },
        { pattern: /\b(poste|expérience|compétences)\b/i, lang: "French" },
        { pattern: /\b(functie|vereisten)\b/i, lang: "Dutch" },
        { pattern: /\b(puesto|requisitos|experiencia)\b/i, lang: "Spanish" }
      ];
      for (const { pattern, lang } of nonEnglish) {
        if (pattern.test(text)) { autoFailReasons.push(`Non-English posting (${lang})`); break; }
      }
    }

    // Language — required foreign language proficiency (not English)
    const LANG_OPTIONAL = /\b(optional|nice to have|advantage|asset|preferred|plus|bonus|beneficial|desirable|welcome|will be an advantage)\b/i;
    const FOREIGN_LANGS = [
      { re: /\bfrench\b/i, name: "French" },
      { re: /\bgerman\b/i, name: "German" },
      { re: /\bdutch\b/i, name: "Dutch" },
      { re: /\bspanish\b/i, name: "Spanish" },
      { re: /\bitalian\b/i, name: "Italian" },
      { re: /\bportuguese\b/i, name: "Portuguese" },
      { re: /\bczech\b/i, name: "Czech" },
      { re: /\bhungarian\b/i, name: "Hungarian" },
      { re: /\bromanian\b/i, name: "Romanian" },
      { re: /\bswedish\b/i, name: "Swedish" },
      { re: /\bdanish\b/i, name: "Danish" },
      { re: /\bfinnish\b/i, name: "Finnish" },
      { re: /\bnorwegian\b/i, name: "Norwegian" }
    ];
    const PROFICIENCY_RE = /\b(c1|c2|fluent|fluency|native|proficient|proficiency|advanced|bilingual|excellent|required|mandatory|must)\b/i;
    const TITLE_LANG_RE = /\bwith\s+(french|german|dutch|spanish|italian|portuguese|czech|hungarian|romanian|swedish|danish|finnish|norwegian)\b/i;

    // Check title first — "Client Operations Partner with French" pattern
    if (!autoFailReasons.length) {
      const titleM = (jobData.title || '').match(TITLE_LANG_RE);
      if (titleM) {
        autoFailReasons.push(`Requires ${titleM[1].charAt(0).toUpperCase() + titleM[1].slice(1)} (not held)`);
      }
    }

    // Check description sentences — lang + proficiency in same sentence, no optional qualifier
    if (!autoFailReasons.length) {
      const langSentences = `${jobData.title || ''} ${jobData.description || ''}`.split(/[.!?\n]+/);
      for (const { re, name } of FOREIGN_LANGS) {
        for (const sentence of langSentences) {
          if (re.test(sentence) && PROFICIENCY_RE.test(sentence) && !LANG_OPTIONAL.test(sentence)) {
            autoFailReasons.push(`Requires ${name} proficiency (not held)`);
            break;
          }
        }
        if (autoFailReasons.length) break;
      }
    }

    // Location
    const isRemote = /\bremote\b|\bwork from home\b|\bwfh\b/i.test(fullText);
    const isOnsite = /\bon.?site\b|\bin.?office\b|\boffice only\b|\boffice.?based\b|\bin person\b|\bin-person\b/i.test(fullText);
    const isHybrid = /\bhybrid\b/i.test(fullText);
    const WARSAW_RE = /\bwarsaw\b|\bwarszawa\b|\bmazowieckie\b|\bmasovian\b|\bmasovia\b|\bmasovian\s*voivodeship\b/i;
    const WARSAW_POSTAL = /\b0[0-4]\d-\d{3}\b/;
    const pageTitle = document.title || '';
    const isWarsaw = WARSAW_RE.test(locationText)
      || WARSAW_RE.test(text)
      || WARSAW_RE.test(pageTitle)
      || WARSAW_POSTAL.test(locationText)
      || WARSAW_POSTAL.test(text);
    const isPoland = /\bpoland\b|\bpolska\b/i.test(locationText) || /\bpoland\b|\bpolska\b/i.test(text) || isWarsaw;
    const NON_WARSAW_CITIES = /\b(krak[oó]w|krakow|gda[nń]sk|gdansk|wrocł?aw|wroclaw|pozna[nń]|poznan|ł?[oó]d[zź]|lodz|katowice|lublin|bydgoszcz|szczecin|białystok|bialystok|rzesz[oó]w|rzeszow|torun|toru[nń]|gdynia|sosnowiec|radom|olsztyn)\b/i;
    const cityInLocation = NON_WARSAW_CITIES.test(locationText);
    const cityInText = NON_WARSAW_CITIES.test(text);
    const nonWarsawCity = cityInLocation || cityInText;
    const RELOCATION_REQUIRED = /\b(relocation\s*(is\s*)?(required|mandatory|necessary|essential|compulsory)|must\s*relocate|required\s*to\s*relocate|you\s*will\s*need\s*to\s*relocate|position\s*requires\s*relocation|this\s*role\s*requires\s*relocation)\b/i;
    const RELOCATION_OPTIONAL = /\b(relocation\s*(assistance|package|support|allowance|optional|available|provided|offered|bonus)|willing\s*to\s*relocate|open\s*to\s*relocation)\b/i;
    const requiresRelocation = RELOCATION_REQUIRED.test(fullText) && !RELOCATION_OPTIONAL.test(fullText);

    if (isOnsite && !isRemote && !isWarsaw) {
      autoFailReasons.push("On-site location is not in Warsaw");
    } else if (isHybrid && !isRemote && nonWarsawCity && !isWarsaw) {
      autoFailReasons.push("Hybrid office is not in Warsaw");
    }
    if (requiresRelocation && !isPoland) {
      autoFailReasons.push("Requires relocation outside Poland");
    }

    // Salary — parse full numbers with comma thousand-separators
    const salarySource = `${jobData.salary || ""} ${jobData.description || ""}`;
    const SALARY_NOISE = /\b(relocation|bonus|allowance|package|reimbursement|referral|signing|voucher|subsidy|benefit|reward|incentive|commission)\b/i;
    const HOURLY_PATTERN = /(\d[\d,.]*\d|\d)\s*(pln|z[łl]|zloty)\s*\/?\s*(h\b|hr\b|hour|hourly|godzin|za\s*godzin)/i;
    const HOURLY_CONTEXT = /\b(per hour|\/hour|hourly|za godzin[ęe]|zł\/h|pln\/h)\b/i;
    const plnPattern = /(\d[\d,.]*\d|\d)\s*(pln|z[łl]|zloty)/gi;
    const plnNums = [];
    let plnM;
    while ((plnM = plnPattern.exec(salarySource)) !== null) {
      // Skip if this number appears within 80 chars of a noise keyword
      const start = Math.max(0, plnM.index - 80);
      const end = Math.min(salarySource.length, plnM.index + plnM[0].length + 80);
      const ctx = salarySource.slice(start, end);
      if (SALARY_NOISE.test(ctx)) continue;
      const raw = plnM[1].replace(/[,\s]/g, '');
      const n = parseFloat(raw);
      if (!isNaN(n)) plnNums.push(n);
    }
    if (plnNums.length > 0) {
      const lowest = Math.min(...plnNums);
      const isAnnual = /\b(annual|annually|per year|yearly|rocznie|\/year|\/yr)\b/i.test(salarySource);
      const isMonthly = /\b(monthly|per month|miesi[eę]cznie|\/month|\/mo)\b/i.test(salarySource);
      // Hourly rate detection — convert to monthly (×8h×22 days)
      const hourlyMatch = HOURLY_PATTERN.exec(salarySource) || (HOURLY_CONTEXT.test(salarySource) ? [null, String(lowest)] : null);
      let monthly;
      if (hourlyMatch && HOURLY_CONTEXT.test(salarySource)) {
        const hourly = parseFloat((hourlyMatch[1] || String(lowest)).replace(/[,\s]/g, ''));
        monthly = hourly * 8 * 22;
      } else {
        monthly = isAnnual ? lowest / 12 : isMonthly ? lowest : lowest > 20000 ? lowest / 12 : lowest;
      }
      if (monthly < 3000) autoFailReasons.push("Salary below 3000 PLN");
    }
    // Auto-fail if Polish explicitly listed as required in language section
    if (!autoFailReasons.length && /language[s]?\s*[:\-]\s*polish\s*(required|\(required\))/i.test(text)) {
      autoFailReasons.push("Polish language listed as required");
    }
    if (autoFailReasons.length > 0) {
      let detectedCatFail = "unknown";
      for (const [cat, keywords] of Object.entries(ROLE_CATEGORIES)) {
        if (keywords.some(kw => text.includes(kw))) { detectedCatFail = cat; break; }
      }
      return {
        score: 0, colour: "fail", recommendation: "Auto Fail",
        autoFail: true, autoFailReason: autoFailReasons.join(" · "),
        category: detectedCatFail,
        cvSelection: resolveCV(detectedCatFail, text),
        positiveMatches: [], negativeMatches: [],
        redFlags: [], skillMatches: [],
        flags: autoFailReasons,
        isRemote, isOnsite, isWarsawJob: isWarsaw,
        locationNote: "", estimatedTime: "~5 min"
      };
    }

    // ─── Build score from zero ────────────────────────────────────────────────
    let score = 0;
    const positiveMatches = [];
    const negativeMatches = [];
    const redFlags = [];
    const skillMatches = [];

    // Step 2 — Role Match (+25 / +15 / +0)
    let detectedCategory = "unknown";
    for (const [cat, keywords] of Object.entries(ROLE_CATEGORIES)) {
      if (keywords.some(kw => text.includes(kw))) { detectedCategory = cat; break; }
    }

    const isExactTitle = PROFILE_TARGET_ROLES.some(role => titleText.includes(role));
    if (isExactTitle) {
      score += 25;
      positiveMatches.push({ message: "Role matches target job category", points: 25 });
    } else if (detectedCategory !== "unknown") {
      score += 15;
      positiveMatches.push({ message: `Role category (${detectedCategory}) detected`, points: 15 });
    }

    // Step 3 — Seniority
    let isCapped = false;
    if (/\b(director|head of|vp |vice president|principal)\b/i.test(text)) {
      isCapped = true;
      negativeMatches.push({ message: "Director/VP-level role — outside target level", points: 0 });
    } else if (/\b(manager|lead|team lead)\b/i.test(text)) {
      negativeMatches.push({ message: "Management role — outside target level", points: 0 });
    } else if (/\bsenior\b/i.test(titleText)) {
      score += 2;
      positiveMatches.push({ message: "Senior role (partial match)", points: 2 });
      negativeMatches.push({ message: "Senior role — may require more experience", points: 0 });
    } else if (/\b(mid.?level|mid level|intermediate)\b/i.test(text)) {
      score += 8;
      positiveMatches.push({ message: "Mid-level role", points: 8 });
    } else if (/\b(entry.?level|entry level|junior|graduate|associate|trainee|no experience required)\b/i.test(text)) {
      score += 15;
      positiveMatches.push({ message: "Entry-level/junior role", points: 15 });
    } else {
      score += 5;
    }

    // Step 4 — Experience Required (role-aware)
    function detectYearsRequired(t) {
      // All patterns require "experience/exp" explicitly — prevents matching salaries, IDs, founded years
      const patterns = [
        /\b(\d{1,2})\s*[-–]\s*\d{1,2}\s*years?\s*(of\s*)?(experience|exp)\b/gi,
        /\b(\d{1,2})\+?\s*years?\s*(of\s*)?(experience|exp)\b/gi,
        /\bminimum\s+(\d{1,2})\s*years?\s*(of\s*)?(experience|exp)\b/gi,
        /\bat\s+least\s+(\d{1,2})\s*years?\s*(of\s*)?(experience|exp)\b/gi
      ];
      let min = null;
      for (const pat of patterns) {
        let m;
        while ((m = pat.exec(t)) !== null) {
          const n = parseInt(m[1]);
          if (n > 25 || n.toString().length === 4) continue; // ignore 4-digit years and implausible values
          if (min === null || n < min) min = n;
        }
      }
      return min;
    }

    const yearsRequired = detectYearsRequired(text);
    const isITSecQA = ["it_support", "security", "qa"].includes(detectedCategory);
    const isCSOrOps = ["customer_support", "operations", "admin", "dispatcher"].includes(detectedCategory);

    let expPoints = 0;
    if (isITSecQA) {
      if (yearsRequired === null) { expPoints = 8; }
      else if (yearsRequired <= 1) { expPoints = 20; }
      else if (yearsRequired <= 2) { expPoints = 18; }
      else if (yearsRequired <= 3) { expPoints = 10; }
      else if (yearsRequired <= 5) { expPoints = 2; negativeMatches.push({ message: `Requires ${yearsRequired}+ years IT experience — stretch role`, points: 0 }); }
      else { expPoints = 0; negativeMatches.push({ message: `Requires ${yearsRequired}+ years IT experience — likely too senior`, points: 0 }); }
    } else if (isCSOrOps) {
      if (yearsRequired === null) { expPoints = 12; }
      else if (yearsRequired <= 1) { expPoints = 20; }
      else if (yearsRequired <= 2) { expPoints = 18; }
      else if (yearsRequired <= 3) { expPoints = 12; }
      else if (yearsRequired <= 5) { expPoints = 5; negativeMatches.push({ message: `Requires ${yearsRequired}+ years experience`, points: 0 }); }
      else { expPoints = 0; negativeMatches.push({ message: `Requires ${yearsRequired}+ years — exceeds profile`, points: 0 }); }
    } else {
      expPoints = yearsRequired === null ? 10 : yearsRequired <= 2 ? 18 : yearsRequired <= 4 ? 10 : 2;
    }

    if (expPoints > 0) {
      score += expPoints;
      positiveMatches.push({
        message: yearsRequired !== null ? `Requires ${yearsRequired} yrs experience — achievable` : "Experience requirements look achievable",
        points: expPoints
      });
    }

    // Step 5 — Skills Overlap (+3 each)
    for (const { pattern, label } of SKILL_PATTERNS) {
      if (pattern.test(text)) {
        score += 3;
        skillMatches.push(`Skill match: ${label}`);
        positiveMatches.push({ message: `Skill match: ${label}`, points: 3 });
      }
    }

    // Step 6 — Education
    if (/\b(computer\s*engineering|computer\s*science|it\s*degree|software\s*engineering)\b/i.test(text)) {
      score += 5;
      positiveMatches.push({ message: "Computer Engineering degree matches field", points: 5 });
    } else if (/\b(bachelor|bsc|beng|degree)\b/i.test(text)) {
      score += 3;
      positiveMatches.push({ message: "Degree requirement — Carlton has BSc (in progress)", points: 3 });
    }
    if (/\b(master.s|mba|phd|doctorate)\b.*required/i.test(text)) {
      score -= 10;
      negativeMatches.push({ message: "Requires Master's/PhD — over-qualification mismatch", points: -10 });
    }

    // Step 7 — Bonus Factors
    if (isRemote) {
      score += 15;
      positiveMatches.push({ message: "Remote position", points: 15 });
    } else if (isWarsaw && (isOnsite || isHybrid)) {
      score += 10;
      positiveMatches.push({ message: isHybrid ? "Hybrid with Warsaw office — commutable" : "On-site in Warsaw — commutable", points: 10 });
    }

    if (jobData.salary && /\b(\d{3,}|\$|£|€|pln|z[łl])\b/i.test(jobData.salary)) {
      score += 3;
      positiveMatches.push({ message: "Salary listed", points: 3 });
    }

    const companyLower = (jobData.company || "").toLowerCase();
    if (WELL_KNOWN_COMPANIES.some(c => companyLower.includes(c))) {
      score += 2;
      positiveMatches.push({ message: "Well-known employer", points: 2 });
    }

    let toolBonus = 0;
    const toolPatterns = [
      { p: /\bzendesk\b/i, n: "Zendesk" }, { p: /\bjira\b/i, n: "Jira" },
      { p: /\bsalesforce\b/i, n: "Salesforce" }, { p: /\bservicenow\b/i, n: "ServiceNow" },
      { p: /\bfreshdesk\b/i, n: "Freshdesk" }
    ];
    for (const { p, n } of toolPatterns) {
      if (p.test(text) && toolBonus < 4) {
        toolBonus += 2;
        positiveMatches.push({ message: `Uses ${n} — tool Carlton knows`, points: 2 });
      }
    }
    score += toolBonus;

    let softBonus = 0;
    const softPatterns = [/\bcommunication\b/i, /\bteamwork\b/i, /\badaptable\b/i, /\bdetail.?oriented\b/i, /\borganis[ez]d\b/i];
    for (const sp of softPatterns) { if (sp.test(text) && softBonus < 3) softBonus++; }
    if (softBonus > 0) {
      score += softBonus;
      positiveMatches.push({ message: `Soft skills emphasis (+${softBonus})`, points: softBonus });
    }

    // Step 7b — Benefits and quality scoring (max +12)
    const benefitPatterns = [
      { pattern: /\b(private\s*medical|health\s*insurance|medical\s*care|healthcare|medicover|luxmed)\b/i, points: 2, label: "Private medical care" },
      { pattern: /\b(multisport|sport\s*card|gym\s*membership|sports?\s*package)\b/i, points: 1, label: "Sports/gym benefit" },
      { pattern: /\b(paid\s*(annual\s*)?(leave|holiday|vacation)|additional\s*days?\s*off|holiday\s*allowance)\b/i, points: 2, label: "Paid leave/holiday" },
      { pattern: /\b(performance\s*bonus|annual\s*bonus|monthly\s*bonus|bonus\s*scheme|incentive\s*pay)\b/i, points: 2, label: "Performance bonus" },
      { pattern: /\b(life\s*insurance|group\s*insurance|pension|ppk)\b/i, points: 1, label: "Life insurance/pension" },
      { pattern: /\b(training|development\s*program|e.?learning|certification\s*sponsored|tuition)\b/i, points: 2, label: "Training and development" },
      { pattern: /\b(career\s*(growth|path|progression)|promotion\s*opportunities|internal\s*mobility)\b/i, points: 2, label: "Career growth opportunities" },
      { pattern: /\b(english\s*(is\s*the\s*)?(working|primary|official)\s*language|english.speaking\s*(environment|team))\b/i, points: 3, label: "English working environment" },
      { pattern: /\b(employment\s*contract|contract\s*of\s*employment|umowa\s*o\s*prac[ęe])\b/i, points: 3, label: "Employment contract" },
      { pattern: /\b(actively\s*(hiring|recruiting)|urgent(ly)?\s*(hiring|needed)|immediate\s*start)\b/i, points: 2, label: "Actively hiring" }
    ];
    let qualityBonus = 0;
    for (const { pattern, points, label } of benefitPatterns) {
      if (pattern.test(text) && qualityBonus < 12) {
        qualityBonus += points;
        positiveMatches.push({ message: label, points });
      }
    }
    score += Math.min(qualityBonus, 12);

    const isAgency = /\b(recruitment\s*agency|staffing\s*agency|on\s*behalf\s*of|our\s*client|recruiting\s*for\s*a)\b/i.test(text);
    if (!isAgency) {
      score += 3;
      positiveMatches.push({ message: "Direct employer posting", points: 3 });
    }

    // Step 8a — Permanent full-time employment bonus (+5)
    if (/\b(permanent\s*position|permanent\s*contract|full.?time\s*permanent|indefinite\s*contract|umowa\s*na\s*czas\s*nieokre[sś]lony)\b/i.test(text)) {
      score += 5;
      positiveMatches.push({ message: "Permanent full-time position", points: 5 });
    }

    // Step 8b — Transferability bonus for ops/admin roles (FIX 8)
    if (["operations", "admin", "dispatcher"].includes(detectedCategory)) {
      let transferBonus = 0;
      if (/\bstakeholder\b/i.test(text)) transferBonus += 3;
      if (/\b(documentation|documenting|reporting)\b/i.test(text)) transferBonus += 3;
      if (/\b(process|workflow)\b/i.test(text)) transferBonus += 2;
      if (/\bcoordination\b/i.test(text)) transferBonus += 2;
      transferBonus = Math.min(transferBonus, 10);
      if (transferBonus > 0) {
        score += transferBonus;
        positiveMatches.push({ message: `Transferable skills bonus (+${transferBonus})`, points: transferBonus });
      }
    }

    // Step 9 — Red Flags (warnings only)
    const redFlagChecks = [
      { pattern: /\b(cissp|cism|cisa|pmp|itil\s*v[34]|comptia)\b/i,                                          message: "Requires certification not yet held" },
      { pattern: /\b(driving\s*licen[cs]e|driver.s\s*licen[cs]e|valid\s*dl)\b/i,                            message: "Requires driving licence" },
      { pattern: /\b(security\s*clearance|sc\s*cleared|dv\s*cleared)\b/i,                                    message: "Requires security clearance" },
      { pattern: /\b(commission\s*only|ote|on-target)\b/i,                                                   message: "Commission-based pay structure" },
      { pattern: /\b(manage a team|people management|team of \d|staff management|direct reports?)\b/i,       message: "Requires people/team management" },
      { pattern: /\b(certified tax advisor|chartered accountant|\bcpa\b|solicitor|licensed engineer|actuary|bar admission)\b/i, message: "Requires professional qualification (not held)" },
      { pattern: /\b(6|7|8|9|10)\+?\s*years?\s*(of\s*)?(tax|accounting|legal|finance|actuarial)\b/i,        message: "Requires 6+ years in specialised field (tax/finance/legal)" },
      { pattern: /\b(temporary\s*contract|fixed.?term|contract\s*length|3.month\s*contract|6.month\s*contract|short.?term\s*contract|temp\s*role|temporary\s*position)\b/i, message: "Temporary/fixed-term contract — not permanent employment" },
      { pattern: /\b(self.employed|b2b\s*contract|b2b\s*only|business.?to.?business|freelance\s*contract|sole\s*trader|own\s*company\s*required)\b/i, message: "Self-employed/B2B contract (not employment)" }
    ];
    for (const { pattern, message } of redFlagChecks) {
      if (pattern.test(text)) redFlags.push(message);
    }

    // FIX C — Temporary contract score penalty (-25)
    const TEMP_CONTRACT_RE = /\b(temporary\s*contract|fixed.?term|contract\s*length|3.month\s*contract|6.month\s*contract|short.?term\s*contract|temp\s*role|temporary\s*position)\b/i;
    if (TEMP_CONTRACT_RE.test(text)) {
      score = Math.max(0, score - 25);
      negativeMatches.push({ message: "Temporary/fixed-term contract (not permanent)", points: -25 });
    }

    // FIX D — Polish language proficiency penalty (-35 if Polish required at professional level)
    const POLISH_REQUIRED = /\b(polish)\b.*?\b(c1|c2|fluent|native|proficient|advanced|required|mandatory|must)\b/i;
    const POLISH_REQUIRED_REV = /\b(c1|c2|fluent|native|proficient|advanced|required|mandatory|must)\b.*?\b(polish)\b/i;
    const POLISH_OPTIONAL = /\b(optional|nice to have|advantage|asset|preferred|plus|beneficial|desirable|welcome)\b/i;
    const polishSentences = text.split(/[.!?\n]+/);
    for (const sentence of polishSentences) {
      if ((POLISH_REQUIRED.test(sentence) || POLISH_REQUIRED_REV.test(sentence)) && !POLISH_OPTIONAL.test(sentence)) {
        score = Math.max(0, score - 35);
        negativeMatches.push({ message: "Polish language proficiency required (not held)", points: -35 });
        break;
      }
    }
    if ((jobData.description || "").length < 300) redFlags.push("Vague job description");

    // Cap director-level at 39 (Poor Match)
    if (isCapped) score = Math.min(score, 39);

    score = Math.max(1, Math.min(100, score));

    let recommendation, colour;
    if (score >= 90)      { recommendation = "Perfect Match"; colour = "perfect"; }
    else if (score >= 75) { recommendation = "Strong Match";  colour = "green"; }
    else if (score >= 60) { recommendation = "Decent Match";  colour = "yellow"; }
    else if (score >= 40) { recommendation = "Weak Match";    colour = "orange"; }
    else                  { recommendation = "Poor Match";    colour = "red"; }

    const estimatedTime = score >= 75 ? "~10 min" : score >= 60 ? "~15-20 min" : "~5 min";
    const locationNote = isRemote ? "Remote position" :
      (isWarsaw && isHybrid) ? "Hybrid with Warsaw office — commutable" :
      (isWarsaw && isOnsite) ? "On-site in Warsaw — commutable" : "";

    return {
      score, colour, recommendation,
      autoFail: false, autoFailReason: "",
      category: detectedCategory,
      cvSelection: resolveCV(detectedCategory, text),
      positiveMatches, negativeMatches,
      redFlags, skillMatches,
      flags: [...negativeMatches.map(n => n.message), ...redFlags],
      isRemote, isOnsite, isWarsawJob: isWarsaw,
      locationNote, estimatedTime
    };
  }

  function parseGeminiJSON(text) {
    let cleaned = (text || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    try { return JSON.parse(cleaned); } catch(e) {}
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch(e) {} }
    return null;
  }

  async function tailorCV(cvId, jobData, category) {
    const base = getBaseCV(cvId);

    const systemPrompt = `RESPOND WITH JSON ONLY. NO OTHER TEXT. START WITH { END WITH }
Tailor Carlton Dzingira's CV for this specific job.
Return exactly this JSON structure:
{"summary":"2-3 sentence summary","skills":["skill1","skill2","skill3","skill4","skill5"],"teleperformance_bullets":["bullet1","bullet2","bullet3","bullet4","bullet5"],"empire_bullets":["bullet1","bullet2","bullet3","bullet4","bullet5"]}
Rules: Never invent experience. Mirror job keywords. Include numbers 60-80 cases and 90-100 interactions. No em dashes. No sign-off.`;

    const userPrompt = `Job: ${jobData.title || 'Unknown'} at ${jobData.company || 'Unknown'}
Description: ${(jobData.description || '').substring(0, 1200)}
Current summary: ${base.summary}
Current skills: ${base.skills.slice(0, 5).join(', ')}
Current TP bullets: ${base.experience[0].bullets.slice(0, 3).join(' | ')}
Current Empire bullets: ${base.experience[1].bullets.slice(0, 3).join(' | ')}
Return JSON only.`;

    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "GEMINI_TAILOR_CV", payload: { systemPrompt, userPrompt } },
        (response) => {
          const parsed = response?.parsed;
          if (!parsed) {
            resolve({ ...base, tailored: false, error: response?.error || 'Parse failed' });
            return;
          }
          resolve({
            ...base,
            summary: parsed.summary || base.summary,
            skills: (parsed.skills || base.skills).slice(0, 5),
            experience: [
              { ...base.experience[0], bullets: parsed.teleperformance_bullets || base.experience[0].bullets },
              { ...base.experience[1], bullets: parsed.empire_bullets || base.experience[1].bullets }
            ],
            tailored: true
          });
        }
      );
    });
  }

  async function generateCoverLetter(jobData, cvId, category) {
    const fallback =
`With ${jobData.company ? jobData.company + "'s" : "your"} focus on ${jobData.title || 'this role'}, my four years of operational experience handling high volumes of cases and interactions directly addresses what you need.\n\nAt Teleperformance in Warsaw, I manage 60-80 customer cases daily via chat and email — troubleshooting issues, documenting cases accurately, and following strict compliance workflows. Before that, as a Dispatcher at Empire National Poland, I coordinated 90-100 daily interactions with drivers, brokers, and clients, resolving time-sensitive issues under pressure. My Computer Engineering background at Vistula University adds a technical foundation to this operational experience.\n\nI work best in structured, process-driven environments where accuracy and clear communication actually matter. The combination of volume, compliance, and coordination in operations work is where I consistently perform well.`;

    const systemPrompt =
`You are Carlton Dzingira writing a cover letter. You are a real person not a corporate robot.
BANNED PHRASES — never use any of these:
- I am writing to express my interest
- highly motivated
- passionate about
- dynamic environment
- team player
- I am a fast learner
- I would be a great asset
- I am excited about the opportunity
- I look forward to hearing from you
- Please find attached
- To whom it may concern
- I believe I would be a great fit
- I would welcome the opportunity
- Thank you for your consideration
- immediately caught my attention
- caught my eye
- aligns perfectly with
- I am confident that
- I would be a perfect fit
- my skills align
- I am a strong candidate
- this opportunity excites me
STRUCTURE — exactly 3 paragraphs:
Paragraph 1 (2-3 sentences): Reference something SPECIFIC and FACTUAL about the company or role — a specific product, service, customer type, industry, or challenge mentioned in the job description. Do not use vague compliments about the company. Show you actually read the job. One sentence connecting your background to their specific need.
Paragraph 2 (3-4 sentences): Real experience with real numbers. Reference: 4 years experience, 60-80 cases daily at Teleperformance, 90-100 interactions daily as Dispatcher, Computer Engineering degree. Connect these directly to what the job requires.
Paragraph 3 (2-3 sentences): Something genuine about why this type of work suits how Carlton operates. What he actually finds satisfying about it. Keep it specific not generic.
Paragraph 3 MUST end with a complete sentence. Never end mid-sentence. The final sentence must be a complete thought that ends with a full stop.
NO closing line. NO sign-off. NO Regards. NO Sincerely. The letter ends after paragraph 3 full stop.
Total length: 250-300 words maximum.
Tone: Professional but human. Confident not arrogant. Reads like a real person wrote it.`;

    const userPrompt =
`Write a cover letter for Carlton Dzingira applying to: ${jobData.title || 'this position'} at ${jobData.company || 'this company'}
Job description key points: ${(jobData.description || '').substring(0, 800)}
Carlton's background:
- Operations Expert at Teleperformance Warsaw (April 2025 to present): handles 60-80 customer cases daily via chat and email, troubleshoots issues, documents cases, follows strict compliance workflows
- Dispatcher at Empire National Poland (Feb 2022 to Dec 2024): managed 90-100 daily interactions with drivers, brokers and clients, coordinated time-sensitive operations, resolved issues under pressure
- Computer Engineering student at Vistula University Warsaw
- Strong English C1, calm under pressure, excellent documentation skills
Return only the 3 paragraph letter body. No greeting. No sign-off. No closing line. Just the three paragraphs.`;

    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "GEMINI_API_CALL", payload: { systemPrompt, userPrompt } },
        (response) => {
          if (chrome.runtime.lastError || response?.error) {
            resolve({ text: fallback, generated: false, error: response?.error || chrome.runtime.lastError?.message });
            return;
          }
          resolve({ text: response.result || fallback, generated: true });
        }
      );
    });
  }

  async function generateAnswers(jobData) {
    const systemPrompt = `You are Carlton Dzingira answering job application screening questions.
Answer each question honestly based on Carlton's real background.
Keep each answer concise 2-4 sentences maximum.
Sound human and genuine not corporate.
Never use: "I am passionate about", "I am a team player", "I am a fast learner"
Carlton: Operations Expert at Teleperformance Warsaw (60-80 cases daily, April 2025-present), Dispatcher at Empire National Poland (90-100 daily interactions, 2022-2024), Computer Engineering student Vistula University Warsaw, English C1, 4 years operations experience.
Return ONLY a JSON array with exactly 8 objects each with "question" and "answer" fields. No other text.`;

    const userPrompt = `Job: ${jobData.title || 'this role'} at ${jobData.company || 'this company'}
Description: ${(jobData.description || '').substring(0, 800)}
Salary: ${jobData.salary || 'not specified'}
Answer these 8 questions for Carlton:
1. Why are you interested in this role?
2. Why do you want to work at ${jobData.company || 'this company'}?
3. What is your greatest strength relevant to this position?
4. Describe a time you handled a difficult customer or situation
5. What is your expected salary?
6. When can you start?
7. Why are you leaving your current job?
8. What makes you a good fit for this role?
Return JSON array only.`;

    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "GEMINI_API_CALL", payload: { systemPrompt, userPrompt } },
        (response) => {
          if (chrome.runtime.lastError || response?.error) { resolve(null); return; }
          try {
            let cleaned = (response.result || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(cleaned);
            resolve(Array.isArray(parsed) ? parsed : null);
          } catch(e) { resolve(null); }
        }
      );
    });
  }

  async function handleGenerateAnswers() {
    const panel = document.getElementById('sa-panel-answers');
    if (panel) panel.innerHTML = '<div class="sa-generating"><div class="sa-spinner sa-spinner-sm"></div>Generating answers...</div>';
    const answers = await generateAnswers(currentJobData);
    if (!answers || answers.length === 0) {
      if (panel) panel.innerHTML = '<div class="sa-error">Could not generate answers. Check your API key.</div>';
      return;
    }
    renderAnswersTab(answers);
  }

  function renderAnswersTab(answers) {
    const panel = document.getElementById('sa-panel-answers');
    if (!panel) return;
    const answersHtml = answers.map((qa, i) => `
      <div class="sa-answer-item">
        <div class="sa-answer-question">Q${i+1}: ${escHtml(qa.question)}</div>
        <div class="sa-answer-text">${escHtml(qa.answer)}</div>
        <button class="sa-btn sa-btn-ghost sa-btn-sm sa-copy-answer" data-answer="${escHtml(qa.answer)}">Copy</button>
      </div>
    `).join('');
    panel.innerHTML = `
      <div class="sa-answers-toolbar">
        <span class="sa-ai-badge">✨ AI Generated</span>
        <button class="sa-btn sa-btn-ghost sa-btn-sm" id="sa-regen-answers">Regenerate</button>
      </div>
      <div class="sa-answers-list">${answersHtml}</div>
    `;
  }

  function getBaseCV(cvId) {
    const CVS = {
      it_support: {
        summary: "IT Support and operations professional with 4 years experience in fast-paced, process-driven environments. Skilled in troubleshooting, ticket documentation, escalation, and supporting users through chat/email/phone while maintaining strong accuracy and service quality. Strong written communication (English C1) and calm under pressure.",
        skills: ["IT Support (Remote / On-site basics)", "Windows Troubleshooting", "User Support & Step-by-Step Guidance", "Ticketing / Case Management", "Issue Escalation & Clear Handover Notes", "VPN / LAN / Wi-Fi Troubleshooting (basic)", "Microsoft 365 / Teams", "Remote support & troubleshooting", "Hardware / Peripheral Setup (basic)", "Strong Written Communication (English C1)"],
        experience: [
          { title: "Operations Expert", company: "Teleperformance", location: "Warsaw", dates: "04/2025 - Present", bullets: ["Handle 60–80 support cases daily via chat/email while maintaining accuracy, professionalism, and quality targets", "Troubleshoot customer issues by verifying account details, reproducing steps, and confirming resolution outcomes", "Document cases clearly with structured notes, supporting evidence, and escalation-ready summaries", "Follow strict workflows and compliance guidelines to ensure consistent case handling", "Identify recurring issues, report patterns, and escalate technical problems with detailed context"] },
          { title: "Dispatcher", company: "Empire National Poland", location: "Warsaw, Poland", dates: "02/2022 - 12/2024", bullets: ["Managed 90–100 daily interactions while coordinating time-sensitive operations", "Resolved urgent issues under pressure by collecting details, troubleshooting, and coordinating solutions", "Maintained accurate documentation, delivery notes, manifests, and compliance records", "Communicated clearly with drivers, brokers, and clients to resolve disruptions"] }
        ],
        education: "Bachelor of Science: Computer Engineering — Vistula University, Warsaw, Poland"
      },
      customer_support: {
        summary: "Customer Support and Operations professional with 4 years experience in fast-paced, high-volume environments. Skilled in case handling, troubleshooting, documentation, and escalation while maintaining strong quality and accuracy. Strong written communication (English C1) and calm under pressure.",
        skills: ["Customer Support (Chat, Email, Phone)", "Case Management & Ticket Documentation", "Troubleshooting & Root Cause Verification", "Escalation Handling & Clear Handover Notes", "Process Compliance & Workflow Accuracy", "KPI / SLA-Driven Performance", "Strong Written Communication (English C1)", "Conflict Resolution & De-escalation", "Microsoft Office", "Time Management & Multitasking"],
        experience: [
          { title: "Operations Expert", company: "Teleperformance", location: "Warsaw", dates: "04/2025 - Present", bullets: ["Handle 60–80 customer cases daily via chat/email while maintaining accuracy, professionalism, and quality targets", "Troubleshoot customer issues by verifying account details, reproducing steps, and confirming resolution outcomes", "Document cases clearly with structured notes, supporting evidence, and escalation-ready summaries", "Follow strict workflows and compliance guidelines", "Identify recurring issues, report patterns, and escalate with detailed context"] },
          { title: "Dispatcher", company: "Empire National Poland", location: "Warsaw, Poland", dates: "02/2022 - 12/2024", bullets: ["Managed 90–100 daily interactions with drivers, brokers, and clients", "Communicated clearly with stakeholders to resolve disruptions and deliver solutions", "Stayed calm and professional handling high-volume calls and urgent requests", "Identified issues early and resolved problems under pressure", "Maintained compliance-related documents including delivery notes and manifests"] }
        ],
        education: "Bachelor of Science: Computer Engineering — Vistula University, Warsaw, Poland"
      },
      operations: {
        summary: "Operations and administrative professional with 4 years experience supporting fast-paced, process-driven environments. Skilled in documentation, coordination, stakeholder communication, and resolving issues under pressure while maintaining accuracy and compliance. Strong written communication (English C1) and highly organised in high-volume work settings.",
        skills: ["Operations Coordination & Administrative Support", "Documentation, Reporting & Record Accuracy", "Process Compliance & Workflow Execution", "KPI / SLA-Driven Performance", "Stakeholder Communication (Clients, Teams, Vendors)", "Issue Tracking, Escalation & Follow-Up", "Scheduling, Prioritisation & Time Management", "Microsoft Office (Excel, Word, Outlook)", "Multitasking in High-Volume Environments", "Attention to Detail & Quality Assurance"],
        experience: [
          { title: "Operations Expert", company: "Teleperformance", location: "Warsaw", dates: "04/2025 - Present", bullets: ["Handle 60–80 customer cases daily via chat/email while maintaining accuracy, professionalism, and quality targets", "Follow strict workflows and compliance guidelines to ensure consistent case handling", "Document cases clearly with structured notes, supporting evidence, and escalation-ready summaries", "Identify recurring issues, report patterns, and escalate complex cases with detailed context", "Adapt quickly to new processes, internal updates, and policy changes while maintaining performance metrics"] },
          { title: "Dispatcher", company: "Empire National Poland", location: "Warsaw, Poland", dates: "02/2022 - 12/2024", bullets: ["Managed time-sensitive daily operations while maintaining accurate documentation and records", "Managed 90–100 daily interactions with drivers, brokers, and clients", "Coordinated schedules, route changes, and operational updates", "Identified issues early and resolved problems under pressure (delays, breakdowns, route changes)", "Maintained compliance-related documents including delivery notes, manifests, and supporting paperwork"] }
        ],
        education: "Bachelor of Science: Computer Engineering — Vistula University, Warsaw, Poland"
      }
    };
    return CVS[cvId] || CVS.customer_support;
  }

  async function autofillPage() {
    const AUTOFILL = {
      fullName: "Carlton Dzingira", firstName: "Carlton", lastName: "Dzingira",
      email: "fredrickcarlton@gmail.com", phone: "+48577327906",
      city: "Warsaw", country: "Poland", location: "Warsaw, Poland",
      currentJobTitle: "Operations Expert", currentCompany: "Teleperformance",
      yearsExperience: "4", workAuthorisation: "Yes", requireSponsorship: "No",
      remotePreference: "Remote", willingToRelocate: "No",
      englishProficiency: "C1 / Advanced", noticePeriod: "2 weeks",
      university: "Vistula University", degree: "Bachelor of Science in Computer Engineering",
      graduationYear: "2026", educationLevel: "Bachelor's Degree (In Progress)"
    };

    const FIELD_MATCHERS = [
      { patterns: [/^(full.?name|name)$/i], value: AUTOFILL.fullName },
      { patterns: [/^first.?name$/i, /firstname/i], value: AUTOFILL.firstName },
      { patterns: [/^last.?name$/i, /lastname|surname/i], value: AUTOFILL.lastName },
      { patterns: [/^email$/i, /e.?mail/i], value: AUTOFILL.email },
      { patterns: [/^phone$/i, /telephone|mobile|cell/i], value: AUTOFILL.phone },
      { patterns: [/^(city|town)$/i], value: AUTOFILL.city },
      { patterns: [/^country$/i], value: AUTOFILL.country },
      { patterns: [/^location$/i, /current.?location/i], value: AUTOFILL.location },
      { patterns: [/current.?(?:job.?)?title|position.?title/i], value: AUTOFILL.currentJobTitle },
      { patterns: [/current.?(?:employer|company)/i], value: AUTOFILL.currentCompany },
      { patterns: [/years.?of.?exp/i], value: AUTOFILL.yearsExperience },
      { patterns: [/work.?auth|right.?to.?work/i], value: AUTOFILL.workAuthorisation },
      { patterns: [/require.?sponsor/i], value: AUTOFILL.requireSponsorship },
      { patterns: [/notice.?period/i], value: AUTOFILL.noticePeriod },
      { patterns: [/english.?level|english.?proficiency/i], value: AUTOFILL.englishProficiency }
    ];

    function getLabelText(el) {
      if (el.id) { const l = document.querySelector(`label[for="${el.id}"]`); if (l) return l.textContent.trim(); }
      const pl = el.closest('label'); if (pl) return pl.textContent.trim();
      return "";
    }

    function matchField(el) {
      const attrs = [el.name, el.id, el.placeholder, el.getAttribute('aria-label')].map(v => (v || "").toLowerCase());
      attrs.push(getLabelText(el).toLowerCase());
      for (const matcher of FIELD_MATCHERS) {
        for (const pattern of matcher.patterns) {
          if (attrs.some(a => a && pattern.test(a))) return matcher.value;
        }
      }
      const acMap = { 'name': AUTOFILL.fullName, 'given-name': AUTOFILL.firstName, 'family-name': AUTOFILL.lastName, 'email': AUTOFILL.email, 'tel': AUTOFILL.phone, 'address-level2': AUTOFILL.city, 'country': AUTOFILL.country, 'country-name': AUTOFILL.country, 'organization': AUTOFILL.currentCompany };
      const ac = el.getAttribute('autocomplete');
      if (ac && acMap[ac]) return acMap[ac];
      return null;
    }

    const delay = (min, max) => new Promise(r => setTimeout(r, Math.random()*(max-min)+min));
    const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]), textarea, select');
    const filled = [], skipped = [];

    for (const input of inputs) {
      if (input.disabled || input.readOnly) continue;
      if ((input.value || "").trim().length > 2) { skipped.push(input.name || 'filled'); continue; }
      const val = matchField(input);
      if (!val) { skipped.push(input.name || 'no-match'); continue; }
      const hint = `${input.name} ${input.id} ${input.placeholder}`.toLowerCase();
      if (/salary|compensation|pay/i.test(hint)) { skipped.push('salary-skipped'); continue; }
      await delay(200, 500);
      if (input.tagName === 'SELECT') {
        const opt = Array.from(input.options).find(o => o.text.toLowerCase().includes(val.toLowerCase()) || o.value.toLowerCase().includes(val.toLowerCase()));
        if (opt) { input.value = opt.value; input.dispatchEvent(new Event('change', { bubbles: true })); filled.push(input.name || input.id); }
      } else {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(input, val); else input.value = val;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        filled.push(input.name || input.id);
      }
    }
    return { filled, skipped, total: inputs.length };
  }

})();
