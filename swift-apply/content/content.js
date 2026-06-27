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
  let chatHistory = [];
  let trackedJobs = [];
  let lastTailoredUrl = null;

  // ─── LinkedIn rate limiting ───────────────────────────────────────────────────
  const linkedinProfileUses = { count: 0, resetTime: Date.now() + 600000 };

  // Scoped sidebar element lookup — avoids conflicts with page elements sharing the same id
  function sid(id) { return sidebarEl ? sidebarEl.querySelector('#' + id) : null; }

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
      scrapeJobData().then(data => sendResponse({ jobData: data }));
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
    const href = window.location.href;
    const isLinkedIn = window.location.hostname.includes('linkedin.com');

    // LinkedIn: route to appropriate handler based on page type
    if (isLinkedIn) {
      if (href.includes('/in/')) {
        initProfileSidebar();
        return;
      }
      if (!href.includes('/jobs/')) {
        showLinkedInNavMessage();
        return;
      }
    }

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

  // ─── LinkedIn: rate limit check ───────────────────────────────────────────────
  function checkLinkedInRateLimit() {
    const now = Date.now();
    if (now > linkedinProfileUses.resetTime) {
      linkedinProfileUses.count = 0;
      linkedinProfileUses.resetTime = now + 600000;
    }
    if (linkedinProfileUses.count >= 10) {
      showToast('Rate limit reached — wait 10 minutes before generating more LinkedIn messages', 'error');
      return false;
    }
    linkedinProfileUses.count++;
    return true;
  }

  // ─── LinkedIn: other pages navigation message ─────────────────────────────────
  function showLinkedInNavMessage() {
    const existing = document.getElementById('swiftapply-sidebar');
    if (existing) existing.remove();
    const sidebar = document.createElement('div');
    sidebar.id = 'swiftapply-sidebar';
    sidebar.className = 'sa-sidebar sa-visible';
    sidebar.innerHTML = `
      <div class="sa-sidebar-inner">
        <div class="sa-header">
          <div class="sa-header-left">
            <span class="sa-logo">⚡</span>
            <span class="sa-brand">SwiftApply</span>
          </div>
          <button class="sa-close-btn" id="sa-close-nav">✕</button>
        </div>
        <div style="padding:20px;text-align:center;color:#64748b;font-size:12px">
          SwiftApply works on job listing pages.<br><br>
          Go to a LinkedIn job posting to use SwiftApply.
        </div>
      </div>
    `;
    document.body.appendChild(sidebar);
    sidebarEl = sidebar;
    sidebarVisible = true;
    const body = document.body;
    if (body) { body.style.transition = 'margin-right 0.3s ease'; body.style.marginRight = '420px'; }
    document.getElementById('sa-close-nav')?.addEventListener('click', hideSidebar);
  }

  // ─── LinkedIn: profile page sidebar ──────────────────────────────────────────
  function initProfileSidebar() {
    const existing = document.getElementById('swiftapply-sidebar');
    if (existing) existing.remove();

    const sidebar = document.createElement('div');
    sidebar.id = 'swiftapply-sidebar';
    sidebar.className = 'sa-sidebar sa-visible';
    sidebar.innerHTML = `
      <div class="sa-sidebar-inner">
        <div class="sa-header">
          <div class="sa-header-left">
            <span class="sa-logo">⚡</span>
            <span class="sa-brand">SwiftApply</span>
          </div>
          <button class="sa-close-btn" id="sa-close-profile">✕</button>
        </div>
        <div class="sa-content" style="padding:12px;overflow-y:auto;flex:1">
          <div class="sa-profile-container">
            <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:8px 10px;margin-bottom:10px;font-size:11px;color:#92400e">
              ⚠ Use responsibly. Only reads publicly visible profile data when you click Read Profile.
            </div>
            <div id="sa-profile-info" style="margin-bottom:8px;font-size:12px;color:#64748b">
              <p style="margin:0;color:#94a3b8;font-style:italic">Click Read Profile to load details</p>
            </div>
            <button class="sa-btn sa-btn-ghost sa-btn-sm" id="sa-read-profile" style="margin-bottom:8px;width:100%">Read Profile</button>
            <div style="margin-bottom:8px">
              <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Connection Message</div>
              <div id="sa-msg-types" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
                <button class="sa-btn sa-btn-ghost sa-btn-sm sa-msg-type-btn" data-type="networking" style="font-size:10px;border-color:#6366f1;color:#6366f1">Networking</button>
                <button class="sa-btn sa-btn-ghost sa-btn-sm sa-msg-type-btn" data-type="job" style="font-size:10px">Job Opportunity</button>
                <button class="sa-btn sa-btn-ghost sa-btn-sm sa-msg-type-btn" data-type="advice" style="font-size:10px">Seek Advice</button>
                <button class="sa-btn sa-btn-ghost sa-btn-sm sa-msg-type-btn" data-type="collaboration" style="font-size:10px">Collaborate</button>
              </div>
              <button class="sa-btn sa-btn-primary" id="sa-generate-message" style="width:100%">✨ Generate Message</button>
            </div>
            <div id="sa-message-output" style="display:none;margin-top:10px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span style="font-size:10px;background:#ddd6fe;color:#5b21b6;padding:2px 6px;border-radius:10px">✨ AI Generated</span>
                <div style="display:flex;gap:4px">
                  <button class="sa-btn sa-btn-ghost sa-btn-sm" id="sa-regen-message" style="font-size:10px">Regenerate</button>
                  <button class="sa-btn sa-btn-ghost sa-btn-sm" id="sa-copy-message" style="font-size:10px">Copy</button>
                </div>
              </div>
              <div id="sa-message-text" style="font-size:12px;line-height:1.5;color:#1e293b;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px"></div>
              <div id="sa-char-count" style="font-size:10px;color:#94a3b8;text-align:right;margin-top:4px"></div>
            </div>
            <div style="margin-top:10px">
              <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Note</div>
              <textarea id="sa-profile-note" style="width:100%;min-height:60px;font-size:12px;border:1px solid #e2e8f0;border-radius:6px;padding:6px;resize:vertical;box-sizing:border-box" placeholder="Follow up actions, where you met..."></textarea>
              <button class="sa-btn sa-btn-ghost sa-btn-sm" id="sa-save-note" style="margin-top:4px">Save Note</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(sidebar);
    sidebarEl = sidebar;
    sidebarVisible = true;
    const body = document.body;
    if (body) { body.style.transition = 'margin-right 0.3s ease'; body.style.marginRight = '420px'; }

    let selectedType = 'networking';

    sidebar.querySelectorAll('.sa-msg-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        sidebar.querySelectorAll('.sa-msg-type-btn').forEach(b => {
          b.style.borderColor = ''; b.style.color = '';
        });
        btn.style.borderColor = '#6366f1'; btn.style.color = '#6366f1';
        selectedType = btn.dataset.type;
      });
    });

    document.getElementById('sa-close-profile')?.addEventListener('click', hideSidebar);

    document.getElementById('sa-read-profile')?.addEventListener('click', () => {
      if (!checkLinkedInRateLimit()) return;
      const profileData = scrapeLinkedInProfile();
      const infoDiv = document.getElementById('sa-profile-info');
      if (infoDiv && profileData.name) {
        infoDiv.innerHTML = `
          <div style="font-weight:600;font-size:13px;color:#1e293b">${escHtml(profileData.name)}</div>
          ${profileData.headline ? `<div style="font-size:12px;color:#64748b;margin-top:2px">${escHtml(profileData.headline)}</div>` : ''}
          ${profileData.location ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px">📍 ${escHtml(profileData.location)}</div>` : ''}
        `;
        sidebar._profileData = profileData;
        showToast('Profile loaded');
      } else {
        showToast('Could not read profile — make sure you are on a profile page', 'error');
      }
    });

    document.getElementById('sa-generate-message')?.addEventListener('click', () => {
      if (!checkLinkedInRateLimit()) return;
      generateConnectionMessage(sidebar._profileData || {}, selectedType, sidebar);
    });

    document.getElementById('sa-regen-message')?.addEventListener('click', () => {
      if (!checkLinkedInRateLimit()) return;
      generateConnectionMessage(sidebar._profileData || {}, selectedType, sidebar);
    });

    document.getElementById('sa-copy-message')?.addEventListener('click', () => {
      const text = document.getElementById('sa-message-text')?.textContent;
      if (text) copyToClipboard(text);
    });

    document.getElementById('sa-save-note')?.addEventListener('click', () => {
      showToast('Note saved');
    });
  }

  function scrapeLinkedInProfile() {
    const name = document.querySelector('h1')?.textContent?.trim() || '';
    const headline = document.querySelector('.text-body-medium.break-words, .ph5 .text-body-medium')?.textContent?.trim() || '';
    const location = document.querySelector('.text-body-small.inline.t-black--light.break-words, .pv-text-details__left-panel .text-body-small')?.textContent?.trim() || '';
    const company = document.querySelector('.pv-text-details__right-panel .hoverable-link-text')?.textContent?.trim() || '';
    return { name, headline, location, company };
  }

  async function generateConnectionMessage(profileData, messageType, sidebar) {
    const outputDiv = document.getElementById('sa-message-output');
    const messageText = document.getElementById('sa-message-text');
    const charCount = document.getElementById('sa-char-count');
    if (!outputDiv || !messageText) return;

    outputDiv.style.display = 'block';
    messageText.textContent = 'Generating...';
    if (charCount) charCount.textContent = '';

    const typeDescriptions = {
      networking: 'expand professional network and have a genuine career conversation',
      job: 'discuss a job opportunity or referral',
      advice: 'seek career advice from a senior professional',
      collaboration: 'explore potential collaboration on a project'
    };

    const systemPrompt = `You are Carlton Dzingira writing a LinkedIn connection request message. Carlton is an Operations Expert at Teleperformance Warsaw with 4 years of operations experience. Computer Engineering student at Vistula University Warsaw.
Rules: Maximum 300 characters. No "I am writing to", "I hope this finds you well", "I would love to connect". Personalised to the recipient if name/headline provided. Professional but human. End with a complete sentence. Write only the message — no explanation.`;

    const name = profileData.name ? `Recipient: ${profileData.name}` : '';
    const headline = profileData.headline ? `Their headline: ${profileData.headline}` : '';

    const userPrompt = `Write a LinkedIn connection request note from Carlton Dzingira.
Purpose: ${typeDescriptions[messageType] || typeDescriptions.networking}
${name}
${headline}
Write the message only. Maximum 300 characters.`;

    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "GEMINI_API_CALL", payload: { systemPrompt, userPrompt } },
        (response) => {
          if (chrome.runtime.lastError || response?.error) {
            const first = profileData.name ? profileData.name.split(' ')[0] : '';
            const fallback = first
              ? `Hi ${first}, I came across your profile and would love to connect. I'm in operations at Teleperformance Warsaw — always looking to grow my network.`
              : `Hi, I came across your profile and would love to connect. I'm in operations at Teleperformance Warsaw — always looking to grow my network.`;
            messageText.textContent = fallback;
            if (charCount) charCount.textContent = `${fallback.length}/300 chars`;
            resolve(); return;
          }
          let text = (response.result || '').trim();
          if (text.length > 300) {
            const trimmed = text.slice(0, 297);
            const lastDot = trimmed.lastIndexOf('.');
            text = lastDot > 150 ? trimmed.slice(0, lastDot + 1) : trimmed + '...';
          }
          messageText.textContent = text;
          if (charCount) charCount.textContent = `${text.length}/300 chars`;
          resolve();
        }
      );
    });
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
      if (id === 'sa-tab-tracker') { showTab('tracker'); renderTrackerTab(); }
      if (id === 'sa-tracker-clear') clearTracker();
      if (id === 'sa-chat-send') handleChatSend();
    });
  }

  function cleanCoverLetter(text) {
    if (!text) return text;
    text = text.replace(/\s*—\s*/g, ', ');
    text = text.replace(/^(Dear|To|Hello|Hi)[^\n]*\n+/im, '');
    text = text.replace(/\n+(Regards|Sincerely|Best|Yours|Kind regards|With regards|Carlton|Warm)[^\n]*/gi, '');
    text = text.replace(/\*\*(.*?)\*\*/g, '$1');
    text = text.replace(/\*(.*?)\*/g, '$1');
    return text.trim();
  }

  // ─── Sidebar content loading ──────────────────────────────────────────────────
  async function initSidebarContent() {
    chatHistory = [];
    // Fix 3: reset tailored CV when on a new job page
    if (window.location.href !== lastTailoredUrl) {
      currentTailoredCV = null;
      currentCoverLetter = null;
    }
    showLoading("Analysing job posting...");

    try {
      currentJobData = await scrapeJobData();

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

      // Save to tracker
      await saveToTracker(currentJobData, currentScoreResult);
      await loadTracker();

      // Show placeholders — Gemini only called on user action
      const cvPanel = sid('sa-panel-cv');
      const coverPanel = sid('sa-panel-cover');
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

      const chatInput = sid('sa-chat-input');
      if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleChatSend();
          }
        });
      }

      // Fix 8c: Check for interrupted operation recovery
      try {
        const pendingRaw = sessionStorage.getItem('swiftApply_pending');
        if (pendingRaw) {
          const pending = JSON.parse(pendingRaw);
          const age = Date.now() - pending.timestamp;
          if (age < 300000) {
            const banner = document.createElement('div');
            banner.style.cssText = 'background:#eff6ff;border:1px solid #93c5fd;border-radius:6px;padding:6px 10px;margin:6px 0;font-size:11px;color:#1e40af;display:flex;align-items:center;justify-content:space-between';
            banner.innerHTML = `<span>${escHtml(pending.op === 'tailorCV' ? 'CV generation' : 'Cover letter generation')} was interrupted for <b>${escHtml(pending.jobTitle || 'this job')}</b>. Resume?</span>
              <span style="display:flex;gap:4px">
                <button class="sa-btn sa-btn-ghost sa-btn-sm" id="sa-resume-op" style="font-size:10px">Resume</button>
                <button class="sa-btn sa-btn-ghost sa-btn-sm" id="sa-dismiss-op" style="font-size:10px">Dismiss</button>
              </span>`;
            const cvPanel = sid('sa-panel-cv');
            if (cvPanel) cvPanel.prepend(banner);
            banner.querySelector('#sa-resume-op')?.addEventListener('click', () => {
              banner.remove();
              if (pending.op === 'tailorCV') handleGenerateCV();
              else handleGenerateCover();
            });
            banner.querySelector('#sa-dismiss-op')?.addEventListener('click', () => {
              sessionStorage.removeItem('swiftApply_pending');
              banner.remove();
            });
          } else {
            sessionStorage.removeItem('swiftApply_pending');
          }
        }
      } catch(e) {}

    } catch (err) {
      showError(`Error: ${err.message}`);
    }
  }

  function enableAttachButton() {
    const btn = sid('sa-btn-attach');
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
    const content = sid('sa-content');
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
        <button class="sa-tab" id="sa-tab-tracker" data-tab="tracker">Tracker</button>
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
        <div class="sa-panel sa-panel-hidden" id="sa-panel-tracker">
          <div class="sa-tracker-container">
            <div class="sa-tracker-header">
              <span class="sa-tracker-count" id="sa-tracker-count">0 jobs tracked</span>
              <button class="sa-btn sa-btn-ghost sa-btn-sm" id="sa-tracker-clear">Clear All</button>
            </div>
            <div class="sa-tracker-list" id="sa-tracker-list">
              <p class="sa-tracker-empty">No jobs tracked yet. Jobs save automatically when you open SwiftApply.</p>
            </div>
          </div>
        </div>
        <div class="sa-panel sa-panel-hidden" id="sa-panel-answers">
          <div class="sa-chat-container" id="sa-chat-container">
            <div class="sa-chat-messages" id="sa-chat-messages">
              <div class="sa-chat-message sa-chat-assistant">
                <div class="sa-chat-bubble">Hi! I know this job and your background. Ask me anything, salary expectations, how to answer screening questions, red flags, what to highlight. Try: "What salary should I ask for?" or "Why do I want this job?"</div>
              </div>
            </div>
            <div class="sa-chat-input-row">
              <input type="text" id="sa-chat-input" class="sa-chat-input" placeholder="Ask anything about this job..." />
              <button class="sa-btn sa-btn-primary sa-chat-send" id="sa-chat-send">Send</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderScoreTab(scoreResult) {
    const panel = sid('sa-panel-score');
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

    const positives = (scoreResult.positiveMatches || []).slice(0, 5);
    const negatives = (scoreResult.negativeMatches || []).slice(0, 3);

    let matchHtml = '';
    if (positives.length > 0) {
      matchHtml += '<div class="sa-match-section-label">What works in your favour</div>';
      matchHtml += positives.map(m => `
        <div class="sa-match-item sa-match-positive">
          <span class="sa-match-icon">✓</span>
          <span class="sa-match-text">${escHtml(m.message)}</span>
          <span class="sa-match-points">+${m.points}</span>
        </div>`).join('');
    }
    if (negatives.length > 0) {
      matchHtml += '<div class="sa-match-section-label sa-match-section-neg">What works against you</div>';
      matchHtml += negatives.map(m => `
        <div class="sa-match-item sa-match-negative">
          <span class="sa-match-icon">✗</span>
          <span class="sa-match-text">${escHtml(m.message)}</span>
          <span class="sa-match-points">${m.points}</span>
        </div>`).join('');
    }
    html += matchHtml;

    if (scoreResult.redFlags && scoreResult.redFlags.length > 0) {
      html += `<div class="sa-signal-section">`;
      html += scoreResult.redFlags.map(f => `<div class="sa-signal sa-warning">⚠ ${escHtml(f)}</div>`).join('');
      html += `</div>`;
    }

    panel.innerHTML = html;
  }

  function renderCVTab(tailoredCV, cvSelection) {
    const panel = sid('sa-panel-cv');
    if (!panel) return;

    if (!tailoredCV.tailored && tailoredCV.error && !tailoredCV.parsed) {
      const isApiKeyErr = tailoredCV.error?.includes('API key') || tailoredCV.error?.includes('No API');
      panel.innerHTML = `
        <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:6px 10px;margin-bottom:8px;font-size:11px;color:#92400e;display:flex;align-items:center;justify-content:space-between">
          <span>Using original CV — AI tailoring unavailable</span>
          ${isApiKeyErr ? `<button class="sa-btn sa-btn-secondary sa-btn-sm" id="sa-open-settings" style="font-size:10px">Add Key</button>` : `<button class="sa-btn sa-btn-ghost sa-btn-sm" id="sa-reload-btn" style="font-size:10px">Retry</button>`}
        </div>
        <div class="sa-cv-toolbar">
          <span class="sa-cv-badge sa-badge-base">📄 Base CV</span>
          <div class="sa-cv-toolbar-btns">
            <button class="sa-btn sa-btn-ghost sa-btn-sm" id="sa-regen-cv">Generate Tailored</button>
          </div>
        </div>
        <div class="sa-cv-preview">${renderCVContent(tailoredCV)}</div>
      `;
      return;
    }

    // Fix 9: calculate change count and show confirmation
    let tailorBanner = '';
    if (tailoredCV.tailored) {
      const baseCV = getBaseCV(tailoredCV._cvId || cvSelection?.cvId || 'customer_support');
      const origWords = new Set((baseCV.summary + ' ' + baseCV.skills.join(' ')).toLowerCase().split(/\s+/));
      const newWords = new Set((tailoredCV.summary + ' ' + (tailoredCV.skills || []).join(' ')).toLowerCase().split(/\s+/));
      let diffCount = 0;
      for (const w of newWords) { if (!origWords.has(w) && w.length > 3) diffCount++; }
      const jobTitle = currentJobData?.title || '';
      if (diffCount > 0) {
        tailorBanner = `<div style="background:#dcfce7;border:1px solid #86efac;border-radius:6px;padding:5px 10px;margin-bottom:8px;font-size:11px;color:#166534">✓ CV tailored for ${escHtml(jobTitle)} — ${diffCount} changes made</div>`;
      } else {
        tailorBanner = `<div style="background:#fef9c3;border:1px solid #fde047;border-radius:6px;padding:5px 10px;margin-bottom:8px;font-size:11px;color:#854d0e">⚠ CV unchanged — AI returned original content</div>`;
      }
    }
    const templateLabel = cvSelection?.cvName || '';
    const companyName = currentJobData?.company || '';
    panel.innerHTML = `
      ${tailorBanner}
      <div class="sa-cv-toolbar">
        <span class="sa-cv-badge ${tailoredCV.tailored ? 'sa-badge-ai' : 'sa-badge-base'}">
          ${tailoredCV.tailored ? `✨ ${escHtml(templateLabel)}${companyName ? ' → ' + escHtml(companyName) : ''}` : '📄 Base CV'}
        </span>
        <div class="sa-cv-toolbar-btns">
          <button class="sa-btn sa-btn-ghost sa-btn-sm" id="sa-regen-cv">Regenerate</button>
          ${tailoredCV.tailored ? `<button class="sa-btn sa-btn-ghost sa-btn-sm" id="sa-show-diff">Show Changes</button>` : ''}
          <button class="sa-btn sa-btn-ghost sa-btn-sm" id="sa-copy-cv">Copy</button>
          ${tailoredCV.docxBase64 ? `<button class="sa-btn sa-btn-secondary sa-btn-sm" id="sa-download-docx">⬇ DOCX</button>` : ''}
        </div>
      </div>
      <div id="sa-cv-view">${renderCVContent(tailoredCV)}</div>
    `;

    // Wire diff toggle
    const diffBtn = sid('sa-show-diff');
    if (diffBtn && tailoredCV.tailored) {
      let diffVisible = false;
      diffBtn.addEventListener('click', () => {
        const view = sid('sa-cv-view') || panel.querySelector('#sa-cv-view');
        if (!view) return;
        if (!diffVisible) {
          const baseCV = getBaseCV(tailoredCV._cvId || cvSelection?.cvId || 'customer_support');
          view.innerHTML = renderCVDiff(baseCV, tailoredCV);
          diffBtn.textContent = 'Hide Changes';
          diffVisible = true;
        } else {
          view.innerHTML = renderCVContent(tailoredCV);
          diffBtn.textContent = 'Show Changes';
          diffVisible = false;
        }
      });
    }
  }

  function renderCVDiff(baseCV, tailoredCV) {
    function diffWords(origText, newText) {
      const origWords = origText.split(/\s+/);
      const newWords = newText.split(/\s+/);
      const origSet = new Set(origWords.map(w => w.toLowerCase().replace(/[^a-z]/g, '')));
      let addedCount = 0;
      const highlighted = newWords.map(w => {
        const clean = w.toLowerCase().replace(/[^a-z]/g, '');
        if (clean.length > 3 && !origSet.has(clean)) {
          addedCount++;
          return `<mark style="background:#fef08a;border-radius:2px">${escHtml(w)}</mark>`;
        }
        return escHtml(w);
      }).join(' ');
      return { html: highlighted, addedCount };
    }

    const summaryDiff = diffWords(baseCV.summary, tailoredCV.summary || baseCV.summary);
    const origSkillsText = baseCV.skills.slice(0, 5).join(' ');
    const newSkillsText = (tailoredCV.skills || baseCV.skills).slice(0, 5).join(' ');
    const skillsDiff = diffWords(origSkillsText, newSkillsText);
    const totalAdded = summaryDiff.addedCount + skillsDiff.addedCount;

    return `
      <div style="font-size:11px;color:#6366f1;font-weight:600;margin-bottom:8px;padding:4px 8px;background:#eef2ff;border-radius:6px">
        ${totalAdded} new keywords added from job description
        <span style="color:#94a3b8;font-weight:400;margin-left:6px">(highlighted in yellow)</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:11px">
        <div>
          <div style="font-weight:600;color:#64748b;margin-bottom:4px;text-align:center">Original</div>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px">
            <div style="font-weight:600;color:#475569;margin-bottom:4px">Summary</div>
            <div style="color:#64748b">${escHtml(baseCV.summary)}</div>
            <div style="font-weight:600;color:#475569;margin:8px 0 4px">Skills</div>
            <div style="color:#64748b">${baseCV.skills.slice(0, 5).map(s => escHtml(s)).join(', ')}</div>
          </div>
        </div>
        <div>
          <div style="font-weight:600;color:#6366f1;margin-bottom:4px;text-align:center">Tailored ✨</div>
          <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:8px">
            <div style="font-weight:600;color:#0369a1;margin-bottom:4px">Summary</div>
            <div>${summaryDiff.html}</div>
            <div style="font-weight:600;color:#0369a1;margin:8px 0 4px">Skills</div>
            <div>${skillsDiff.html}</div>
          </div>
        </div>
      </div>
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
    const panel = sid('sa-panel-cover');
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
    const btn = sid('sa-btn-autofill');
    if (btn) { btn.textContent = 'Filling...'; btn.disabled = true; }
    try {
      const result = await autofillPage();
      if (result.filled.length === 0) {
        showToast('No fillable fields found on this page', 'info');
      } else {
        showToast(`Filled ${result.filled.length} fields — review before submitting`);
      }
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
    const btn = sid('sa-btn-attach');
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
    return _renderCVDoc(cv, 1.0).output('blob');
  }

  function _renderCVDoc(cv, scale) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = 210;
    const pageH = 297;
    const margin = 12;
    const contentW = pageW - margin * 2;
    let y = 12;

    // Spacing values scaled by multiplier
    const lh       = 4.0 * scale;   // standard line height
    const bulletLh = 4.2 * scale;   // bullet line height
    const skillLh  = 4.5 * scale;   // skill line height
    const secGap   = 4.0 * scale;   // gap after section header rule
    const itemGap  = 4.0 * scale;   // gap between work history items

    function sectionLine(yPos) {
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.line(margin, yPos, pageW - margin, yPos);
    }

    function addSection(title) {
      if (y > 260) { doc.addPage(); y = 12; }
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(title, margin, y);
      y += 2.5;
      sectionLine(y);
      y += secGap;
    }

    // NAME
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('CARLTON DZINGIRA', pageW / 2, y, { align: 'center' });
    y += 6;

    // CONTACT
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text('Warsaw, 02-685 Poland  |  +48577327906  |  fredrickcarlton@gmail.com', pageW / 2, y, { align: 'center' });
    y += 4;

    // LINKEDIN below contact
    doc.text('linkedin.com/in/carlton-dzingira-694253231', pageW / 2, y, { align: 'center' });
    y += 3;
    sectionLine(y);
    y += 4;

    // PROFESSIONAL SUMMARY
    addSection('PROFESSIONAL SUMMARY');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const summaryLines = doc.splitTextToSize(cv.summary || '', contentW);
    doc.text(summaryLines, margin, y);
    y += summaryLines.length * lh + (4 * scale);

    // SKILLS single column ATS compatible
    addSection('SKILLS');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    for (const skill of (cv.skills || []).slice(0, 5)) {
      if (y > 270) { doc.addPage(); y = 12; }
      doc.text('-  ' + skill, margin + 2, y);
      y += skillLh;
    }
    y += (3 * scale);

    // WORK HISTORY with full bullets
    addSection('WORK HISTORY');
    for (const exp of (cv.experience || [])) {
      if (y > 262) { doc.addPage(); y = 12; }
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(exp.title || '', margin, y);
      doc.text(exp.dates || '', pageW - margin, y, { align: 'right' });
      y += (4.5 * scale);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.text((exp.company || '') + ' - ' + (exp.location || ''), margin, y);
      y += (4 * scale);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      const bullets = Array.isArray(exp.bullets) ? exp.bullets : [];
      for (let i = 0; i < bullets.length; i++) {
        const bullet = bullets[i];
        if (!bullet || typeof bullet !== 'string' || !bullet.trim()) continue;
        if (y > 272) { doc.addPage(); y = 12; }
        const bulletLines = doc.splitTextToSize('-  ' + bullet.trim(), contentW - 6);
        doc.text(bulletLines, margin + 3, y);
        y += bulletLines.length * bulletLh + (0.5 * scale);
      }
      y += itemGap;
    }

    // EDUCATION
    addSection('EDUCATION');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Bachelor of Science: Computer Engineering', margin, y);
    y += (4.5 * scale);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('Vistula University - Warsaw, Poland  |  Expected: 2026', margin, y);
    y += 4;

    // Scale up if content fills less than 80% of the page
    if (scale === 1.0 && doc.getNumberOfPages() === 1 && y < pageH * 0.80) {
      const usable = pageH - 12 - 12; // top + bottom margin
      const used = y - 12;
      const newScale = Math.min((usable * 0.88) / used, 1.55);
      if (newScale > 1.05) return _renderCVDoc(cv, newScale);
    }

    return doc;
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
    if (!currentJobData || !currentScoreResult) return;
    // Always regenerate — clear cache and call API fresh
    currentTailoredCV = null;
    const panel = sid('sa-panel-cv');
    if (panel) panel.innerHTML = '<div class="sa-generating"><div class="sa-spinner sa-spinner-sm"></div>Re-tailoring your CV...</div>';
    try { sessionStorage.setItem('swiftApply_pending', JSON.stringify({ op: 'tailorCV', jobTitle: currentJobData?.title, timestamp: Date.now() })); } catch(e) {}
    currentTailoredCV = await tailorCV(
      currentScoreResult.cvSelection.cvId,
      currentJobData,
      currentScoreResult.category
    ).catch(err => ({ ...getBaseCV(currentScoreResult.cvSelection.cvId), tailored: false, error: err.message }));
    try { sessionStorage.removeItem('swiftApply_pending'); } catch(e) {}
    currentTailoredCV._cvId = currentScoreResult.cvSelection.cvId;
    lastTailoredUrl = window.location.href;
    renderCVTab(currentTailoredCV, currentScoreResult.cvSelection);
    enableAttachButton();
  }

  async function regenCoverLetter() {
    if (!currentJobData) return;
    const panel = sid('sa-panel-cover');
    if (panel) panel.innerHTML = `<div class="sa-generating"><div class="sa-spinner sa-spinner-sm"></div>Rewriting cover letter...</div>`;

    const raw = await generateCoverLetter(currentJobData, currentScoreResult.cvSelection.cvId, currentScoreResult.category)
      .catch(err => ({ error: err.message, generated: false }));
    currentCoverLetter = { ...raw, text: cleanCoverLetter(raw.text) };
    renderCoverTab(currentCoverLetter);
  }

  async function handleGenerateCV() {
    const panel = sid('sa-panel-cv');
    if (panel) panel.innerHTML = `<div class="sa-generating"><div class="sa-spinner sa-spinner-sm"></div>Tailoring your CV...</div>`;
    // Fix 8c: save pending state
    try { sessionStorage.setItem('swiftApply_pending', JSON.stringify({ op: 'tailorCV', jobTitle: currentJobData?.title, timestamp: Date.now() })); } catch(e) {}
    currentTailoredCV = await tailorCV(
      currentScoreResult.cvSelection.cvId,
      currentJobData,
      currentScoreResult.category
    ).catch(err => ({ ...getBaseCV(currentScoreResult.cvSelection.cvId), tailored: false, error: err.message }));
    try { sessionStorage.removeItem('swiftApply_pending'); } catch(e) {}
    currentTailoredCV._cvId = currentScoreResult.cvSelection.cvId;
    lastTailoredUrl = window.location.href;
    renderCVTab(currentTailoredCV, currentScoreResult.cvSelection);
    enableAttachButton();
  }

  async function handleGenerateCover() {
    const panel = sid('sa-panel-cover');
    if (panel) panel.innerHTML = `<div class="sa-generating"><div class="sa-spinner sa-spinner-sm"></div>Writing your cover letter...</div>`;
    // Fix 8c: save pending state
    try { sessionStorage.setItem('swiftApply_pending', JSON.stringify({ op: 'coverLetter', jobTitle: currentJobData?.title, timestamp: Date.now() })); } catch(e) {}
    const raw = await generateCoverLetter(
      currentJobData,
      currentScoreResult.cvSelection.cvId,
      currentScoreResult.category
    ).catch(err => ({ text: '', generated: false, error: err.message }));
    try { sessionStorage.removeItem('swiftApply_pending'); } catch(e) {}
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
    const content = sid('sa-content');
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
    const content = sid('sa-content');
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
    const bar = sid('sa-action-bar');
    if (!bar) return;
    bar.style.display = 'flex';

    const isLinkedIn = window.location.hostname.includes('linkedin.com');
    const attachBtn = sid('sa-btn-attach');
    const autofillBtn = sid('sa-btn-autofill');
    const footerNote = sid('sa-footer-note');

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

  async function scrapeJobData() {
    // Click "show more" / expand buttons first
    const expandSelectors = [
      '[data-test="show-more-btn"]',
      '.show-more-btn',
      '[aria-label*="Show more"]',
      '[aria-label*="See more"]',
      '.jobs-description__footer-button',
      '[data-tracking-control-name*="see_more"]'
    ];
    for (const sel of expandSelectors) {
      const btn = document.querySelector(sel);
      if (btn) {
        try { btn.click(); await new Promise(r => setTimeout(r, 600)); } catch(e) {}
      }
    }

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
          'datagroup': 'Datagroup', 'asseco': 'Asseco', 'comarch': 'Comarch',
          'ppg': 'PPG', 'rwe': 'RWE', 'bechtel': 'Bechtel', 'ttec': 'TTEC'
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

    // Smart selector scoring — pick best description by length × keyword density
    const JOB_KEYWORDS = /responsibilit|requirement|qualif|experience|skill|salary|benefit|role|position|job/i;
    let description = "";
    let bestScore = 0;
    let winnerSelector = '';
    for (const sel of (config?.description || genericDescription)) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const t = (el.innerText || el.textContent || "").trim();
          if (t.length > 100) {
            const kwCount = (t.match(new RegExp(JOB_KEYWORDS.source, 'gi')) || []).length;
            const selScore = t.length * (kwCount * 0.1 + 1);
            if (selScore > bestScore) { bestScore = selScore; description = t; winnerSelector = sel; }
          }
        }
      } catch(e) {}
    }
    if (winnerSelector) console.log('Best description selector:', winnerSelector, 'score:', Math.round(bestScore));
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
    if (!description || description.length < 200) {
      const candidates = Array.from(document.querySelectorAll('div, section, article'))
        .filter(el => el.children.length > 2)
        .map(el => el.innerText || '')
        .filter(t => t.length > 200);
      if (candidates.length > 0) {
        description = candidates.reduce((a, b) => a.length > b.length ? a : b, '');
      }
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

    // Direct patterns — fluency in X, X C1/C2, X spoken and written
    if (!autoFailReasons.length) {
      const LANG_LIST_RE = '(french|german|dutch|spanish|italian|portuguese|czech|hungarian|romanian|swedish|danish|finnish|norwegian|turkish|arabic|japanese|korean|chinese|mandarin)';
      const directPatterns = [
        new RegExp(`\\b(fluency|fluent|proficiency|proficient|native|excellent|strong|advanced)\\s+in\\s+${LANG_LIST_RE}\\b`, 'i'),
        new RegExp(`\\b${LANG_LIST_RE}\\s+(c1|c2|b2\\+|native|fluent|required|mandatory)\\b`, 'i'),
        new RegExp(`\\b${LANG_LIST_RE}\\s+(both\\s+)?(spoken\\s+and\\s+written|written\\s+and\\s+spoken)\\b`, 'i'),
      ];
      const allText = `${jobData.title || ''} ${jobData.description || ''}`;
      const dirSentences = allText.split(/[.!?\n]+/);
      for (const pat of directPatterns) {
        for (const sentence of dirSentences) {
          const m = sentence.match(pat);
          if (m && !LANG_OPTIONAL.test(sentence)) {
            const lang = (m[1] || m[2] || '').replace(/\b\w/g, c => c.toUpperCase());
            autoFailReasons.push(`Requires ${lang} language (not held)`);
            break;
          }
        }
        if (autoFailReasons.length) break;
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
    const SALARY_CONTEXT = /\b(salary|wynagrodzenie|gross|net|monthly|per month|compensation|base pay|base salary|miesi[eę]cznie|brutto|netto|earnings|remuneration|pay range|pay scale)\b/i;
    if (plnNums.length > 0 && SALARY_CONTEXT.test(salarySource)) {
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
      { pattern: /\b(self.employed|b2b\s*(only|contract)|business.?to.?business|freelance\s*(only|contract)|must\s*be\s*self.employed|contractor\s*only|no\s*employment\s*contract|sole\s*trader|own\s*company\s*required)\b/i, message: "B2B/self-employed contract only — no employment contract" }
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

    // FIX D — Polish language: auto-fail if C1/C2 required, penalty if general proficiency required
    const POLISH_C1C2 = /\b(polish|język polski)\s*(c1|c2|native|fluent|biegły|biegle)\b/i;
    const POLISH_C1C2_REV = /\b(c1|c2|native|fluent|biegły|biegle)\s*(polish|język polski)\b/i;
    const POLISH_PHRASES = /\b(biegła znajomość języka polskiego|native polish|fluent polish required)\b/i;
    const POLISH_REQUIRED = /\b(polish)\b.*?\b(c1|c2|fluent|native|proficient|advanced|required|mandatory|must)\b/i;
    const POLISH_REQUIRED_REV = /\b(c1|c2|fluent|native|proficient|advanced|required|mandatory|must)\b.*?\b(polish)\b/i;
    const POLISH_OPTIONAL = /\b(optional|nice to have|advantage|asset|preferred|plus|beneficial|desirable|welcome)\b/i;
    const polishSentences = text.split(/[.!?\n]+/);
    for (const sentence of polishSentences) {
      if ((POLISH_C1C2.test(sentence) || POLISH_C1C2_REV.test(sentence) || POLISH_PHRASES.test(sentence)) && !POLISH_OPTIONAL.test(sentence)) {
        return {
          score: 0, colour: "fail", recommendation: "Auto Fail",
          autoFail: true, autoFailReason: "Requires professional Polish (C1/C2) — Carlton's Polish is not at this level",
          category: detectedCategory, cvSelection: resolveCV(detectedCategory, text),
          positiveMatches: [], negativeMatches: [], redFlags: [], skillMatches: [],
          flags: ["Requires professional Polish (C1/C2) — Carlton's Polish is not at this level"],
          isRemote, isOnsite, isWarsawJob: isWarsaw, locationNote: "", estimatedTime: "~5 min"
        };
      }
    }
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
    if (!text) return null;
    let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    try { return JSON.parse(cleaned); } catch(e) {}
    // Extract first { ... } block
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch(e) {} }
    // Field-level regex extraction as last resort
    try {
      const summary = text.match(/"summary"\s*:\s*"([^"]+)"/)?.[1] || '';
      const skillsRaw = text.match(/"skills"\s*:\s*\[([^\]]+)\]/)?.[1] || '';
      const skills = skillsRaw.match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
      const j1Raw = text.match(/"bullets_job1"\s*:\s*\[([^\]]+)\]/)?.[1]
        || text.match(/"teleperformance_bullets"\s*:\s*\[([^\]]+)\]/)?.[1] || '';
      const j1 = j1Raw.match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
      const j2Raw = text.match(/"bullets_job2"\s*:\s*\[([^\]]+)\]/)?.[1]
        || text.match(/"empire_bullets"\s*:\s*\[([^\]]+)\]/)?.[1] || '';
      const j2 = j2Raw.match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
      if (summary && skills.length > 0) {
        return { summary, skills, bullets_job1: j1, bullets_job2: j2,
                 teleperformance_bullets: j1, empire_bullets: j2 };
      }
    } catch(e) {}
    return null;
  }

  async function tailorCV(cvId, jobData, category) {
    console.log('[SA-CV-CONTENT] tailorCV called — cvId:', cvId, '| category:', category);
    console.log('[SA-CV-CONTENT] jobData.title:', jobData?.title);
    console.log('[SA-CV-CONTENT] jobData.description length:', jobData?.description?.length || 0);

    const base = getBaseCV(cvId);

    const systemPrompt = `You must respond with ONLY a valid JSON object. No markdown, no code blocks, no explanation, no preamble. Start your response with { and end with }. The JSON must have exactly these keys: summary (string), skills (array of strings), bullets_job1 (array of strings), bullets_job2 (array of strings). Nothing else.
Rules: Never invent experience. Mirror job keywords. Include numbers 60-80 cases and 90-100 interactions. No em dashes. No sign-off.`;

    const userPrompt = `Job: ${jobData.title || 'Unknown'} at ${jobData.company || 'Unknown'}
Description: ${(jobData.description || '').substring(0, 1200)}
Current summary: ${base.summary}
Current skills: ${base.skills.slice(0, 5).join(', ')}
Current job1 bullets: ${base.experience[0].bullets.slice(0, 3).join(' | ')}
Current job2 bullets: ${base.experience[1].bullets.slice(0, 3).join(' | ')}
Return JSON only with keys: summary, skills, bullets_job1, bullets_job2`;

    console.log('[SA-CV-CONTENT] Sending GEMINI_TAILOR_CV message to service worker...');
    console.log('[SA-CV-CONTENT] Prompt total chars:', systemPrompt.length + userPrompt.length);

    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "GEMINI_TAILOR_CV", payload: { systemPrompt, userPrompt } },
        (response) => {
          console.log('[SA-CV-CONTENT] Service worker response received:', JSON.stringify(response)?.substring(0, 200));
          console.log('[SA-CV-CONTENT] response.parsed:', response?.parsed ? 'PRESENT' : 'NULL/UNDEFINED');
          console.log('[SA-CV-CONTENT] response.error:', response?.error || 'none');

          if (chrome.runtime.lastError) {
            console.error('[SA-CV-CONTENT] chrome.runtime.lastError:', chrome.runtime.lastError.message);
          }

          const parsed = response?.parsed;
          if (!parsed) {
            console.warn('[SA-CV-CONTENT] No parsed data — falling back to base CV. Error:', response?.error);
            resolve({ ...base, tailored: false, error: response?.error || 'Parse failed' });
            return;
          }
          const j1 = parsed.bullets_job1 || parsed.teleperformance_bullets;
          const j2 = parsed.bullets_job2 || parsed.empire_bullets;
          console.log('[SA-CV-CONTENT] Tailoring SUCCESS — applying parsed data');
          resolve({
            ...base,
            summary: parsed.summary || base.summary,
            skills: (parsed.skills || base.skills).slice(0, 5),
            experience: [
              { ...base.experience[0], bullets: j1 || base.experience[0].bullets },
              { ...base.experience[1], bullets: j2 || base.experience[1].bullets }
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
Tone: Professional but human. Confident not arrogant. Reads like a real person wrote it.
You MUST write all 3 complete paragraphs. Never stop mid-sentence. Do not stop writing until all 3 paragraphs are fully written with complete final sentences.`;

    const userPrompt =
`Write a cover letter for Carlton Dzingira applying to: ${jobData.title || 'this position'} at ${jobData.company || 'this company'}
Job description key points: ${(jobData.description || '').substring(0, 800)}
Carlton's background:
- Operations Expert at Teleperformance Warsaw (April 2025 to present): handles 60-80 customer cases daily via chat and email, troubleshoots issues, documents cases, follows strict compliance workflows
- Dispatcher at Empire National Poland (Feb 2022 to Dec 2024): managed 90-100 daily interactions with drivers, brokers and clients, coordinated time-sensitive operations, resolved issues under pressure
- Computer Engineering student at Vistula University Warsaw
- Strong English C1, calm under pressure, excellent documentation skills
Return only the 3 paragraph letter body. No greeting. No sign-off. No closing line. Just the three paragraphs.
IMPORTANT: Write the complete letter. Do not stop until all 3 paragraphs are finished with complete sentences.`;

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

  async function handleChatSend() {
    console.log('[SA-CHAT] handleChatSend called, currentJobData:', currentJobData?.title, '| score:', currentScoreResult?.score, '| hasDescription:', !!(currentJobData?.description));
    const input = sid('sa-chat-input');
    const messages = sid('sa-chat-messages');
    const sendBtn = sid('sa-chat-send');
    if (!input || !messages) return;
    const userMessage = input.value.trim();
    if (!userMessage) return;
    input.value = '';
    input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;

    messages.innerHTML += `<div class="sa-chat-message sa-chat-user"><div class="sa-chat-bubble">${escHtml(userMessage)}</div></div>`;
    const typingId = 'sa-typing-' + Date.now();
    messages.innerHTML += `<div class="sa-chat-message sa-chat-assistant" id="${typingId}"><div class="sa-chat-bubble sa-chat-typing">Thinking...</div></div>`;
    messages.scrollTop = messages.scrollHeight;
    chatHistory.push({ role: 'user', content: userMessage });

    const chatSystemPrompt = `You are an expert job application coach and career advisor with deep knowledge of the Polish job market, Warsaw salary benchmarks, and hiring practices across all industries.

You are helping Carlton Dzingira with his application to: ${currentJobData?.title || 'this job'} at ${currentJobData?.company || 'this company'}.

FULL JOB DETAILS:
Title: ${currentJobData?.title || 'Unknown'}
Company: ${currentJobData?.company || 'Unknown'}
Location: ${currentJobData?.location || 'Unknown'}
Salary: ${currentJobData?.salary || 'Not listed'}
Description: ${(currentJobData?.description || '').substring(0, 2000)}

CARLTON'S BACKGROUND:
- Current: Operations Expert at Teleperformance Warsaw since April 2025, handling 60-80 cases daily
- Previous: Dispatcher at Empire National Poland Feb 2022 to Dec 2024, managing 90-100 daily interactions
- Education: BSc Computer Engineering at Vistula University Warsaw, graduating 2026
- English: C1 level
- Skills: Operations, customer support, documentation, escalation, KPI/SLA, Microsoft Office, Windows troubleshooting
- Match score for this job: ${currentScoreResult?.score || 0}/100 — ${currentScoreResult?.recommendation || 'Unknown'}
- CV template selected: ${currentScoreResult?.cvSelection?.cvName || 'Unknown'}${currentTailoredCV?.tailored ? '\n- Tailored CV summary: ' + (currentTailoredCV.summary || '').substring(0, 300) : ''}

YOUR ROLE:
- Give specific, actionable advice about THIS specific job and company
- For salary questions: always give a specific PLN range based on Warsaw market rates for this role even if salary is not listed. Use your knowledge of Polish salary benchmarks
- For motivation questions: give Carlton specific reasons based on this company and role, not generic answers
- For screening questions: give Carlton a specific 2-3 sentence answer he can use directly
- Never be vague or generic. Always be specific to this job and Carlton's actual background
- Be direct and opinionated like a real career coach
- Keep answers to 2-4 sentences unless the question genuinely requires more detail
- Never use em dashes. Never use markdown bold or headers. Write in plain conversational sentences only`;

    console.log('[SA-CHAT] Sending chat — job:', currentJobData?.title, '| score:', currentScoreResult?.score, '| descLen:', (currentJobData?.description || '').length);

    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: "GEMINI_CHAT", payload: { systemPrompt: chatSystemPrompt, history: chatHistory.slice(-6), userMessage } },
          (response) => resolve(response)
        );
      });
      const assistantMessage = (response?.result && response.result.length > 10)
        ? response.result
        : 'Could not get a response. Gemini quota may be exceeded and Ollama fallback attempted. Try: ollama serve in your terminal or wait a moment and try again.';
      const aiSource = response?.source || 'unknown';
      console.log('[SA-CHAT] Response received — source:', aiSource, '| length:', assistantMessage.length);
      chatHistory.push({ role: 'assistant', content: assistantMessage });
      const typingEl = sidebarEl && sidebarEl.querySelector('#' + typingId);
      if (typingEl) typingEl.remove();
      const sourceBadge = aiSource === 'gemini'
        ? '<span class="sa-ai-badge sa-ai-badge-gemini" title="Powered by Gemini">G</span>'
        : aiSource === 'ollama'
        ? '<span class="sa-ai-badge sa-ai-badge-ollama" title="Powered by Ollama (local)">O</span>'
        : '';
      messages.innerHTML += `<div class="sa-chat-message sa-chat-assistant"><div class="sa-chat-bubble">${escHtml(assistantMessage)}${sourceBadge}</div></div>`;
    } catch(err) {
      const typingEl = sidebarEl && sidebarEl.querySelector('#' + typingId);
      if (typingEl) typingEl.innerHTML = '<div class="sa-chat-bubble sa-chat-error">Error: ' + escHtml(err.message) + '</div>';
    }

    messages.scrollTop = messages.scrollHeight;
    input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    input.focus();
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

  // ─── Tracker ──────────────────────────────────────────────────────────────────
  async function loadTracker() {
    try {
      const result = await chrome.storage.local.get(['swiftApplyTracker']);
      trackedJobs = result.swiftApplyTracker || [];
    } catch(e) { trackedJobs = []; }
  }

  async function saveToTracker(jobData, scoreResult) {
    if (!jobData?.title) return;
    await loadTracker();
    const existing = trackedJobs.find(j => j.url === window.location.href);
    if (existing) {
      existing.lastSeen = new Date().toISOString();
      existing.score = scoreResult?.score;
    } else {
      trackedJobs.unshift({
        id: Date.now(),
        title: jobData.title || 'Unknown Role',
        company: jobData.company || 'Unknown Company',
        location: jobData.location || '',
        score: scoreResult?.score || 0,
        autoFail: scoreResult?.autoFail || false,
        salary: jobData.salary || '',
        url: window.location.href,
        savedAt: new Date().toISOString(),
        status: 'viewed'
      });
      if (trackedJobs.length > 100) trackedJobs = trackedJobs.slice(0, 100);
    }
    await chrome.storage.local.set({ swiftApplyTracker: trackedJobs });
  }

  function renderTrackerTab() {
    const list = sid('sa-tracker-list');
    const count = sid('sa-tracker-count');
    if (!list) return;
    if (count) count.textContent = `${trackedJobs.length} jobs tracked`;
    if (trackedJobs.length === 0) {
      list.innerHTML = '<p class="sa-tracker-empty">No jobs tracked yet.</p>';
      return;
    }
    list.innerHTML = trackedJobs.map(job => {
      const date = new Date(job.savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const scoreColor = job.autoFail ? '#ef4444' : job.score >= 75 ? '#22c55e' : job.score >= 60 ? '#eab308' : '#f97316';
      const scoreLabel = job.autoFail ? 'FAIL' : job.score;
      return `
        <div class="sa-tracker-item">
          <div class="sa-tracker-score" style="color:${scoreColor}">${scoreLabel}</div>
          <div class="sa-tracker-info">
            <div class="sa-tracker-title">${escHtml(job.title)}</div>
            <div class="sa-tracker-company">${escHtml(job.company)}${job.location ? ' · ' + escHtml(job.location) : ''}</div>
            ${job.salary ? `<div class="sa-tracker-salary">${escHtml(job.salary)}</div>` : ''}
          </div>
          <div class="sa-tracker-meta">
            <div class="sa-tracker-date">${date}</div>
            ${job.url ? `<a href="${job.url}" target="_blank" class="sa-tracker-link">View Job ↗</a>` : ''}
            <select class="sa-tracker-status" data-job-id="${job.id}">
              <option value="viewed" ${job.status === 'viewed' ? 'selected' : ''}>Viewed</option>
              <option value="applied" ${job.status === 'applied' ? 'selected' : ''}>Applied</option>
              <option value="interview" ${job.status === 'interview' ? 'selected' : ''}>Interview</option>
              <option value="rejected" ${job.status === 'rejected' ? 'selected' : ''}>Rejected</option>
              <option value="offer" ${job.status === 'offer' ? 'selected' : ''}>Offer</option>
            </select>
          </div>
        </div>
      `;
    }).join('');
    list.querySelectorAll('.sa-tracker-status').forEach(sel => {
      sel.addEventListener('change', async (e) => {
        const jobId = parseInt(e.target.dataset.jobId);
        const job = trackedJobs.find(j => j.id === jobId);
        if (job) {
          job.status = e.target.value;
          await chrome.storage.local.set({ swiftApplyTracker: trackedJobs });
          showToast('Status updated');
        }
      });
    });
  }

  async function clearTracker() {
    trackedJobs = [];
    await chrome.storage.local.set({ swiftApplyTracker: [] });
    renderTrackerTab();
    showToast('Tracker cleared');
  }

  async function autofillPage() {
    const filled = [];
    const failed = [];

    const profile = {
      firstName: 'Carlton',
      middleName: 'Fredrick',
      lastName: 'Dzingira',
      fullName: 'Carlton Dzingira',
      fullNameWithMiddle: 'Carlton Fredrick Dzingira',
      gender: 'Male',
      email: 'fredrickcarlton@gmail.com',
      phone: '+48577327906',
      phoneLocal: '48577327906',
      dateOfBirth: '13/02/2003',
      dobDay: '13',
      dobMonth: '02',
      dobYear: '2003',
      age: '22',
      language: 'English',
      languageVariant: 'English (United Kingdom)',
      homeAddress: 'Stefana Bryly 3, Warsaw',
      homeStreet: 'Stefana Bryly 3',
      workAddress: 'Vistula University, Stoklosy 3, Warsaw',
      location: 'Warsaw, Poland',
      city: 'Warsaw',
      country: 'Poland',
      countryCode: 'PL',
      postalCode: '02-685',
      linkedin: 'linkedin.com/in/carlton-dzingira-694253231',
      website: 'linkedin.com/in/carlton-dzingira-694253231',
      currentTitle: 'Operations Expert',
      currentCompany: 'Teleperformance',
      yearsExperience: '4',
      noticePeriod: '2 weeks',
      workAuth: 'yes',
      sponsorship: 'no',
      relocate: 'no',
      remoteWork: 'yes',
      english: 'C1',
      englishFull: 'C1 Advanced',
      languageLevel: 'Fluent',
      startDate: 'Immediately',
      availability: 'Immediately',
      salary: currentJobData?.salary || '',
      educationLevel: "Bachelor's Degree",
      degree: 'Bachelor of Science in Computer Engineering',
      university: 'Vistula University',
      graduationYear: '2026',
      pronouns: 'He/Him'
    };

    function findLabel(el) {
      if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label) return label.textContent;
      }
      const parentLabel = el.closest('label');
      if (parentLabel) return parentLabel.textContent;
      const prevSibling = el.previousElementSibling;
      if (prevSibling?.tagName === 'LABEL') return prevSibling.textContent;
      const wrapper = el.closest('[class*="field"], [class*="form"], [class*="input"], [class*="group"]');
      if (wrapper) {
        const label = wrapper.querySelector('label, [class*="label"]');
        if (label) return label.textContent;
      }
      return '';
    }

    function getValueForField(el) {
      const attrs = [
        el.name, el.id, el.placeholder,
        el.getAttribute('aria-label'),
        el.getAttribute('data-field'),
        el.closest('[data-field]')?.getAttribute('data-field')
      ].map(v => (v || '').toLowerCase()).join(' ');
      const label = findLabel(el)?.toLowerCase() || '';
      const context = attrs + ' ' + label;

      if (/first.?name|fname|forename|given.?name/.test(context)) return profile.firstName;
      if (/last.?name|lname|surname|family.?name/.test(context)) return profile.lastName;
      if (/full.?name|your.?name|applicant.?name/.test(context)) return profile.fullName;
      if (/email|e-mail/.test(context)) return profile.email;
      if (/phone|mobile|tel|contact.?number/.test(context)) return profile.phone;
      if (/linkedin/.test(context)) return profile.linkedin;
      if (/website|portfolio|url/.test(context)) return profile.website;
      if (/city/.test(context)) return profile.city;
      if (/country/.test(context)) return profile.country;
      if (/address|location/.test(context)) return profile.location;
      if (/salary|compensation|expected.?pay|desired.?salary/.test(context)) return profile.salary;
      if (/current.?title|job.?title|position/.test(context)) return profile.currentTitle;
      if (/current.?company|employer/.test(context)) return profile.currentCompany;
      if (/years?.?of?.?exp|experience.?years/.test(context)) return profile.yearsExperience;
      if (/notice.?period/.test(context)) return profile.noticePeriod;
      if (/start.?date|available.?from|when.?can.?you.?start/.test(context)) return profile.startDate;
      if (/english|language.?level/.test(context)) return profile.english;
      if (/middle.?name/.test(context)) return profile.middleName;
      if (/gender|sex(?!\s*ual)/.test(context)) return profile.gender;
      if (/date.?of.?birth|dob|birth.?date|birthday/.test(context)) return profile.dateOfBirth;
      if (/birth.?day|day.?of.?birth/.test(context)) return profile.dobDay;
      if (/birth.?month|month.?of.?birth/.test(context)) return profile.dobMonth;
      if (/birth.?year|year.?of.?birth/.test(context)) return profile.dobYear;
      if (/street|address.?line.?1|home.?address/.test(context)) return profile.homeStreet;
      if (/postal|zip.?code|postcode/.test(context)) return profile.postalCode;
      if (/pronouns/.test(context)) return profile.pronouns;
      if (/university|school|institution/.test(context)) return profile.university;
      if (/degree|qualification/.test(context)) return profile.degree;
      if (/graduation|grad.?year/.test(context)) return profile.graduationYear;
      if (/education.?level|highest.?education/.test(context)) return profile.educationLevel;
      if (/availability|available.?from/.test(context)) return profile.availability;
      if (/\bage\b/.test(context)) return profile.age;
      // autocomplete attribute fallback
      const acMap = { 'given-name': profile.firstName, 'family-name': profile.lastName, 'name': profile.fullName, 'email': profile.email, 'tel': profile.phone, 'address-level2': profile.city, 'country': profile.country, 'country-name': profile.country, 'organization': profile.currentCompany, 'url': profile.linkedin };
      const ac = el.getAttribute('autocomplete');
      if (ac && acMap[ac]) return acMap[ac];
      return null;
    }

    // TIER 1 — Standard text inputs
    const textInputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], input:not([type]), textarea');
    for (const input of textInputs) {
      if (input.value && input.value.trim()) continue;
      if (input.readOnly || input.disabled) continue;
      const value = getValueForField(input);
      if (value) {
        try {
          input.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(input, value); else input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
          input.blur();
          filled.push(input.name || input.id || 'field');
        } catch(e) { failed.push(e.message); }
      }
    }

    // TIER 2 — Native <select> dropdowns with fuzzy matching
    const selects = document.querySelectorAll('select');
    for (const select of selects) {
      if (select.disabled) continue;
      const context = [select.name, select.id, findLabel(select)].join(' ').toLowerCase();

      let targetValue = null;
      if (/country/.test(context)) targetValue = 'Poland';
      else if (/city/.test(context)) targetValue = 'Warsaw';
      else if (/english|language/.test(context)) targetValue = 'C1';
      else if (/experience|years/.test(context)) targetValue = '3';
      else if (/work.?auth|authoris|right.?to.?work|eligible/.test(context)) targetValue = 'yes';
      else if (/sponsor/.test(context)) targetValue = 'no';
      else if (/relocat/.test(context)) targetValue = 'no';
      else if (/remote|work.?from.?home/.test(context)) targetValue = 'yes';
      else if (/employ.?type|job.?type|contract/.test(context)) targetValue = 'full';
      else if (/gender/.test(context)) targetValue = 'prefer not';
      else if (/notice/.test(context)) targetValue = '2';
      else if (/salary|currency/.test(context)) targetValue = 'pln';

      if (targetValue) {
        const options = Array.from(select.options);
        const match = options.find(opt => {
          const text = opt.text.toLowerCase();
          const val = opt.value.toLowerCase();
          return text.includes(targetValue.toLowerCase()) || val.includes(targetValue.toLowerCase());
        });
        if (match) {
          select.value = match.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          select.dispatchEvent(new Event('input', { bubbles: true }));
          filled.push('select:' + (select.name || context));
        }
      }
    }

    // TIER 3 — Smart radio button detection by group context
    const radioGroups = {};
    document.querySelectorAll('input[type="radio"]').forEach(radio => {
      const name = radio.name || radio.id || 'group_' + Math.random();
      if (!radioGroups[name]) radioGroups[name] = [];
      radioGroups[name].push(radio);
    });

    for (const [groupName, radios] of Object.entries(radioGroups)) {
      const firstRadio = radios[0];
      const groupContext = [
        groupName,
        firstRadio?.closest('fieldset')?.querySelector('legend')?.textContent || '',
        firstRadio?.closest('[class*="question"]')?.textContent || '',
        firstRadio?.closest('[class*="field"]')?.querySelector('label,p,h3,h4')?.textContent || '',
        document.querySelector(`label[for="${firstRadio?.id}"]`)?.textContent || ''
      ].join(' ').toLowerCase();

      let targetValue = null;
      if (/work.?auth|right.?to.?work|eligible|authoris|legally/.test(groupContext)) targetValue = 'yes';
      else if (/require.?sponsor|need.?sponsor|visa.?sponsor/.test(groupContext)) targetValue = 'no';
      else if (/willing.?to.?relocat|relocation/.test(groupContext)) targetValue = 'no';
      else if (/remote|work.?from.?home/.test(groupContext)) targetValue = 'yes';
      else if (/full.?time|permanent/.test(groupContext)) targetValue = 'yes';
      else if (/18.?year|over.?18|age.?confirm/.test(groupContext)) targetValue = 'yes';
      else if (/disability|disabled/.test(groupContext)) targetValue = 'prefer';
      else if (/veteran|military/.test(groupContext)) targetValue = 'no';
      else if (/gender/.test(groupContext)) targetValue = 'prefer';
      else if (/currently.?employed|are.?you.?employed/.test(groupContext)) targetValue = 'yes';

      if (!targetValue) continue;

      for (const radio of radios) {
        const radioContext = [
          radio.value,
          document.querySelector(`label[for="${radio.id}"]`)?.textContent,
          radio.closest('label')?.textContent,
          radio.parentElement?.textContent
        ].join(' ').toLowerCase();

        let shouldCheck = false;
        if (targetValue === 'yes' && /^(yes|true|1|i am|i do|confirm|agree|eligible|authorized)/.test(radioContext.trim())) shouldCheck = true;
        if (targetValue === 'no' && /^(no|false|0|i am not|i do not|not eligible)/.test(radioContext.trim())) shouldCheck = true;
        if (targetValue === 'prefer' && /prefer.?not|decline|do not wish/.test(radioContext)) shouldCheck = true;

        if (shouldCheck && !radio.checked) {
          radio.checked = true;
          radio.dispatchEvent(new Event('change', { bubbles: true }));
          radio.dispatchEvent(new Event('click', { bubbles: true }));
          radio.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          radio.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          filled.push('radio:' + groupName.substring(0, 20));
          break;
        }
      }
    }

    // TIER 4 — Custom click-based dropdowns
    await fillCustomDropdowns(profile, filled);

    return { filled, failed };
  }

  async function fillCustomDropdowns(profile, filled) {
    const dropdownTriggers = document.querySelectorAll([
      '[role="combobox"]',
      '[aria-haspopup="listbox"]',
      '[class*="dropdown"][class*="select"]',
      '[class*="Select__control"]',
      '[class*="select__control"]',
      '[data-ui="select"]'
    ].join(', '));

    for (const trigger of dropdownTriggers) {
      try {
        const context = [
          trigger.getAttribute('aria-label'),
          trigger.closest('[class*="field"]')?.querySelector('label')?.textContent,
          trigger.closest('[class*="form"]')?.querySelector('label')?.textContent
        ].join(' ').toLowerCase();

        let targetText = null;
        if (/country/.test(context)) targetText = 'Poland';
        else if (/english|language/.test(context)) targetText = 'C1';
        else if (/work.?auth|right.?to.?work/.test(context)) targetText = 'Yes';
        else if (/sponsor/.test(context)) targetText = 'No';
        else if (/relocat/.test(context)) targetText = 'No';
        else if (/employ.?type|job.?type/.test(context)) targetText = 'Full-time';

        if (!targetText) continue;

        trigger.click();
        await new Promise(r => setTimeout(r, 300));

        const options = document.querySelectorAll('[role="option"], [class*="option"], [class*="Option"], li[class*="item"]');
        for (const option of options) {
          if (option.textContent.toLowerCase().includes(targetText.toLowerCase())) {
            option.click();
            filled.push('custom-dropdown:' + context.slice(0, 20));
            break;
          }
        }

        await new Promise(r => setTimeout(r, 200));
      } catch(e) {
        // skip failed custom dropdowns silently
      }
    }
  }

})();
