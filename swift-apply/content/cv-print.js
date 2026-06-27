// CV print renderer — generates print-ready HTML that preserves the Word template structure
// User clicks "Download PDF" → new tab opens → Ctrl+P → Save as PDF

/**
 * Opens a print-ready tab with the tailored CV
 * Layout matches the original Word template exactly
 */
export function openCVPrintTab(cv, jobData) {
  const html = buildCVHtml(cv, jobData);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const tab = window.open(url, '_blank');
  // Clean up blob URL after tab opens
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return tab;
}

/**
 * Build print-ready HTML that matches the Word CV template structure:
 * - Name centred at top (small caps style)
 * - Contact info row
 * - Horizontal rule dividers
 * - Section headers centred with lines
 * - Two-column skills layout
 * - Left-aligned job entries with bullet points
 */
function buildCVHtml(cv, jobData) {
  const skills = cv.skills || [];
  const mid = Math.ceil(skills.length / 2);
  const skillsLeft = skills.slice(0, mid);
  const skillsRight = skills.slice(mid);

  const skillsHtml = `
    <table class="skills-table">
      <tr>
        <td>
          ${skillsLeft.map(s => `<div class="skill-item">• ${esc(s)}</div>`).join('')}
        </td>
        <td>
          ${skillsRight.map(s => `<div class="skill-item">• ${esc(s)}</div>`).join('')}
        </td>
      </tr>
    </table>
  `;

  const expHtml = (cv.experience || []).map(exp => `
    <div class="exp-block">
      <div class="exp-header">
        <span class="exp-title-company"><strong>${esc(exp.title)}</strong>, ${esc(exp.dates)}</span>
      </div>
      <div class="exp-org"><strong>${esc(exp.company)}</strong> – ${esc(exp.location)}</div>
      <ul class="bullets">
        ${(exp.bullets || []).map(b => `<li>${esc(b)}</li>`).join('')}
      </ul>
    </div>
  `).join('');

  const hobbiesHtml = (cv.hobbies || []).map(h => `<li>${esc(h)}</li>`).join('');

  const tailoredNote = jobData
    ? `<!-- Tailored for: ${esc(jobData.title)} at ${esc(jobData.company || 'Unknown')} -->`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Carlton Dzingira — CV${jobData ? ` (${jobData.title})` : ''}</title>
<style>
  /* ── Page setup ── */
  @page {
    size: A4;
    margin: 18mm 20mm 18mm 20mm;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Garamond', 'Georgia', 'Times New Roman', serif;
    font-size: 10.5pt;
    color: #1a1a1a;
    line-height: 1.35;
    background: #fff;
  }

  /* ── Name ── */
  .cv-name {
    text-align: center;
    font-variant: small-caps;
    font-size: 18pt;
    font-weight: 700;
    letter-spacing: 2px;
    margin-bottom: 2pt;
    font-family: 'Garamond', 'Georgia', serif;
  }

  /* ── Top rule ── */
  .top-rule {
    border: none;
    border-top: 2px solid #1a1a1a;
    margin: 2pt 0;
  }
  .thin-rule {
    border: none;
    border-top: 0.5px solid #1a1a1a;
    margin: 1pt 0 3pt;
  }

  /* ── Contact line ── */
  .contact-line {
    text-align: center;
    font-size: 9pt;
    color: #1a1a1a;
    margin: 3pt 0 4pt;
    letter-spacing: 0.3px;
  }
  .contact-sep { margin: 0 5px; color: #555; }

  /* ── Section headers ── */
  .section {
    margin-top: 10pt;
    margin-bottom: 4pt;
  }

  .section-header {
    text-align: center;
    font-variant: small-caps;
    font-size: 10.5pt;
    font-weight: 700;
    letter-spacing: 1.5px;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 6pt;
  }

  .section-header::before,
  .section-header::after {
    content: '';
    flex: 1;
    border-top: 1px solid #1a1a1a;
  }

  /* ── Professional summary ── */
  .summary-text {
    font-size: 10pt;
    text-align: justify;
    margin-top: 4pt;
    line-height: 1.4;
  }

  /* ── Skills two-column ── */
  .skills-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 4pt;
  }

  .skills-table td {
    width: 50%;
    vertical-align: top;
    padding: 0;
  }

  .skill-item {
    font-size: 10pt;
    padding: 1pt 0;
    padding-left: 2pt;
  }

  /* ── Work history ── */
  .exp-block {
    margin-top: 7pt;
  }

  .exp-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .exp-title-company {
    font-size: 10.5pt;
  }

  .exp-org {
    font-size: 10pt;
    margin-top: 1pt;
    margin-bottom: 2pt;
    color: #2a2a2a;
  }

  .bullets {
    margin-left: 14pt;
    margin-top: 2pt;
  }

  .bullets li {
    font-size: 10pt;
    margin-bottom: 1.5pt;
    line-height: 1.35;
  }

  /* ── Education ── */
  .education-text {
    margin-top: 4pt;
    font-size: 10pt;
  }

  .edu-degree { font-weight: 700; }

  /* ── Hobbies ── */
  .hobbies-list {
    margin-left: 14pt;
    margin-top: 4pt;
  }
  .hobbies-list li { font-size: 10pt; margin-bottom: 1.5pt; }

  /* ── Print button (hidden when printing) ── */
  .print-controls {
    position: fixed;
    top: 16px;
    right: 16px;
    display: flex;
    gap: 8px;
    z-index: 999;
  }
  .print-btn {
    background: #6366f1;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 10px 20px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    font-family: sans-serif;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  }
  .print-btn:hover { background: #4f52e0; }
  .print-btn.secondary { background: #1e2330; }

  @media print {
    .print-controls { display: none !important; }
    body { margin: 0; }
  }
</style>
</head>
<body>
${tailoredNote}

<!-- Print controls -->
<div class="print-controls">
  <button class="print-btn" onclick="window.print()">⬇ Save as PDF</button>
  <button class="print-btn secondary" onclick="window.close()">✕ Close</button>
</div>

<!-- CV Document -->
<div class="cv-name">Carlton Dzingira</div>
<hr class="top-rule">
<hr class="thin-rule">

<div class="contact-line">
  Warsaw, 02-685 Poland
  <span class="contact-sep">◆</span>
  +48577327906
  <span class="contact-sep">◆</span>
  fredrickcarlton@gmail.com
</div>

<hr class="thin-rule">

<!-- Professional Summary -->
<div class="section">
  <div class="section-header">Professional Summary</div>
  <p class="summary-text">${esc(cv.summary || '')}</p>
</div>

<!-- Skills -->
<div class="section">
  <div class="section-header">Skills</div>
  ${skillsHtml}
</div>

<!-- Work History -->
<div class="section">
  <div class="section-header">Work History</div>
  ${expHtml}
</div>

<!-- Education -->
<div class="section">
  <div class="section-header">Education</div>
  <div class="education-text">
    <span class="edu-degree">Bachelor of Science</span>: Computer Engineering<br>
    <strong>Vistula University</strong> - Warsaw, Poland
  </div>
</div>

${cv.hobbies && cv.hobbies.length > 0 ? `
<!-- Hobbies -->
<div class="section">
  <div class="section-header">Hobbies</div>
  <ul class="hobbies-list">
    ${hobbiesHtml}
  </ul>
</div>
` : ''}

<script>
  // Auto-trigger print dialog after a short delay
  window.addEventListener('load', () => {
    setTimeout(() => {
      // Show page first so user can verify, then auto-print
      // Uncomment below to auto-open print dialog:
      // window.print();
    }, 500);
  });
</script>
</body>
</html>`;
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
