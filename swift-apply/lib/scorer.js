// Job scoring engine — scores a job posting 1-100 based on Carlton's profile

import { PROFILE } from './profile.js';

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

/**
 * Detect the job category from title + description
 */
export function detectJobCategory(jobData) {
  const text = `${jobData.title} ${jobData.description}`.toLowerCase();
  for (const [category, keywords] of Object.entries(ROLE_CATEGORIES)) {
    if (keywords.some(kw => text.includes(kw))) return category;
  }
  return "unknown";
}

/**
 * Select CV template based on job category
 */
export function selectCV(category, text) {
  const CV_MAP = {
    it_support:       { cvId: "it_support",       cvName: "IT Support CV",         reason: "IT/technical role — using IT Support CV" },
    security:         { cvId: "it_support",       cvName: "IT Support CV",         reason: "Security/tech role — using IT Support CV" },
    qa:               { cvId: "it_support",       cvName: "IT Support CV",         reason: "QA/Testing role — using IT Support CV" },
    customer_support: { cvId: "customer_support", cvName: "Customer Support CV",   reason: "Customer-facing role — using Customer Support CV" },
    operations:       { cvId: "operations",       cvName: "Operations / Admin CV", reason: "Operations role — using Operations/Admin CV" },
    admin:            { cvId: "operations",       cvName: "Operations / Admin CV", reason: "Administrative role — using Operations/Admin CV" },
    dispatcher:       { cvId: "operations",       cvName: "Operations / Admin CV", reason: "Logistics/dispatch role — using Operations/Admin CV" },
  };
  if (CV_MAP[category]) return CV_MAP[category];
  // Unknown — keyword fallback (FIX 1)
  const t = (text || "").toLowerCase();
  if (/\b(data|engineer|developer|cloud|artificial intelligence|\bai\b|software|sql|python|systems analyst|machine learning|programming|infrastructure|cybersecurity|network|database)\b/i.test(t))
    return { cvId: "it_support", cvName: "IT Support CV", reason: "Technical keywords detected" };
  if (/\b(procurement|purchasing|buyer|supply chain|logistics|facilities|office admin|dispatch|warehouse|sourcing|vendor)\b/i.test(t))
    return { cvId: "operations", cvName: "Operations / Admin CV", reason: "Operations keywords detected" };
  if (/\b(customer service|customer support|support agent|call cent(re|er)|helpdesk)\b/i.test(t))
    return { cvId: "customer_support", cvName: "Customer Support CV", reason: "Customer service role" };
  return { cvId: "customer_support", cvName: "Customer Support CV", reason: "General role — default" };
}

function detectYearsRequired(text) {
  const patterns = [
    /\b(\d{1,2})\s*[-–]\s*\d{1,2}\s*years?\s*(of\s*)?(experience|exp)\b/gi,
    /\b(\d{1,2})\+?\s*years?\s*(of\s*)?(experience|exp)\b/gi,
    /\bminimum\s+(\d{1,2})\s*years?\s*(of\s*)?(experience|exp)\b/gi,
    /\bat\s+least\s+(\d{1,2})\s*years?\s*(of\s*)?(experience|exp)\b/gi
  ];
  let min = null;
  for (const pat of patterns) {
    let m;
    while ((m = pat.exec(text)) !== null) {
      const n = parseInt(m[1]);
      if (n > 25) continue;
      if (min === null || n < min) min = n;
    }
  }
  return min;
}

/**
 * Main scoring function — returns a full score report
 */
export function scoreJob(jobData) {
  const text = `${jobData.title} ${jobData.description}`.toLowerCase();
  const titleText = (jobData.title || "").toLowerCase();
  const locationText = (jobData.location || "").toLowerCase();
  const fullText = `${text} ${locationText} ${jobData.salary || ""}`;

  // ─── Step 1: Auto-Fail Checks ─────────────────────────────────────────────
  const autoFailReasons = [];

  const polishDiacriticCount = (text.match(/[ąęóśźżćń]/g) || []).length;
  const polishDiacriticRatio = text.length > 0 ? polishDiacriticCount / text.length : 0;
  const hasPolishKeywords = /\b(wymagania|obowi[aą]zki|stanowisko|do[sś]wiadczenie|oferujemy)\b/i.test(text);
  if (polishDiacriticRatio > 0.03 || hasPolishKeywords) {
    autoFailReasons.push("Polish-only job posting");
  }

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

  // Language — job title contains "with [language]" pattern (e.g. "Client Operations Partner with French")
  if (!autoFailReasons.length) {
    const TITLE_LANG_RE = /\bwith\s+(french|german|dutch|spanish|italian|portuguese|czech|hungarian|romanian|swedish|danish|finnish|norwegian)\b/i;
    const titleM = (jobData.title || '').match(TITLE_LANG_RE);
    if (titleM) {
      autoFailReasons.push(`Requires ${titleM[1].charAt(0).toUpperCase() + titleM[1].slice(1)} (not held)`);
    }
  }

  // Language — direct pattern matches (fluency in X, X C1/C2, X spoken and written)
  if (!autoFailReasons.length) {
    const LANG_LIST = '(french|german|dutch|spanish|italian|portuguese|czech|hungarian|romanian|swedish|danish|finnish|norwegian|turkish|arabic|japanese|korean|chinese|mandarin)';
    const LANG_OPTIONAL = /\b(optional|nice to have|advantage|asset|preferred|plus|bonus|beneficial|desirable|welcome|a plus|basic|a1|a2)\b/i;
    const directPatterns = [
      new RegExp(`\\b(fluency|fluent|proficiency|proficient|native|excellent|strong|advanced)\\s+in\\s+${LANG_LIST}\\b`, 'i'),
      new RegExp(`\\b${LANG_LIST}\\s+(c1|c2|b2\\+|native|fluent|required|mandatory)\\b`, 'i'),
      new RegExp(`\\b${LANG_LIST}\\s+(both\\s+)?(spoken\\s+and\\s+written|written\\s+and\\s+spoken)\\b`, 'i'),
    ];
    const sentences = text.split(/[.!?\n]+/);
    for (const pat of directPatterns) {
      for (const sentence of sentences) {
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

  // Language — required foreign language proficiency (sentence-level check)
  if (!autoFailReasons.length) {
    const OPTIONAL_QUALIFIER = /\b(optional|nice to have|advantage|asset|preferred|plus|bonus|beneficial|desirable|welcome)\b/i;
    const FOREIGN_LANG_CHECKS = [
      { pattern: /\b(french|français)\b.*?\b(c1|c2|fluent|native|proficient|advanced|bilingual)\b/i, lang: "French" },
      { pattern: /\b(c1|c2|fluent|native|proficient|advanced|bilingual)\b.*?\b(french|français)\b/i, lang: "French" },
      { pattern: /\b(german|deutsch)\b.*?\b(c1|c2|fluent|native|proficient|advanced|bilingual)\b/i, lang: "German" },
      { pattern: /\b(c1|c2|fluent|native|proficient|advanced|bilingual)\b.*?\b(german|deutsch)\b/i, lang: "German" },
      { pattern: /\b(dutch|nederlands)\b.*?\b(c1|c2|fluent|native|proficient|advanced|bilingual)\b/i, lang: "Dutch" },
      { pattern: /\b(c1|c2|fluent|native|proficient|advanced|bilingual)\b.*?\b(dutch|nederlands)\b/i, lang: "Dutch" },
      { pattern: /\b(spanish|español)\b.*?\b(c1|c2|fluent|native|proficient|advanced|bilingual)\b/i, lang: "Spanish" },
      { pattern: /\b(c1|c2|fluent|native|proficient|advanced|bilingual)\b.*?\b(spanish|español)\b/i, lang: "Spanish" },
      { pattern: /\b(italian|italiano)\b.*?\b(c1|c2|fluent|native|proficient|advanced|bilingual)\b/i, lang: "Italian" },
      { pattern: /\b(c1|c2|fluent|native|proficient|advanced|bilingual)\b.*?\b(italian|italiano)\b/i, lang: "Italian" },
      { pattern: /\b(portuguese|português)\b.*?\b(c1|c2|fluent|native|proficient|advanced|bilingual)\b/i, lang: "Portuguese" },
      { pattern: /\b(c1|c2|fluent|native|proficient|advanced|bilingual)\b.*?\b(portuguese|português)\b/i, lang: "Portuguese" },
      { pattern: /\b(czech|čeština)\b.*?\b(c1|c2|fluent|native|proficient|advanced|bilingual)\b/i, lang: "Czech" },
      { pattern: /\b(hungarian|magyar)\b.*?\b(c1|c2|fluent|native|proficient|advanced|bilingual)\b/i, lang: "Hungarian" },
      { pattern: /\b(romanian|română)\b.*?\b(c1|c2|fluent|native|proficient|advanced|bilingual)\b/i, lang: "Romanian" },
      { pattern: /\b(swedish|svenska)\b.*?\b(c1|c2|fluent|native|proficient|advanced|bilingual)\b/i, lang: "Swedish" },
      { pattern: /\b(danish|dansk)\b.*?\b(c1|c2|fluent|native|proficient|advanced|bilingual)\b/i, lang: "Danish" },
      { pattern: /\b(finnish|suomi)\b.*?\b(c1|c2|fluent|native|proficient|advanced|bilingual)\b/i, lang: "Finnish" },
      { pattern: /\b(norwegian|norsk)\b.*?\b(c1|c2|fluent|native|proficient|advanced|bilingual)\b/i, lang: "Norwegian" },
    ];
    const sentences = text.split(/[.!?\n]+/);
    for (const { pattern, lang } of FOREIGN_LANG_CHECKS) {
      for (const sentence of sentences) {
        if (pattern.test(sentence) && !OPTIONAL_QUALIFIER.test(sentence)) {
          autoFailReasons.push(`Requires ${lang} proficiency (not held)`);
          break;
        }
      }
      if (autoFailReasons.length) break;
    }
  }

  const isRemote = /\bremote\b|\bwork from home\b|\bwfh\b/i.test(fullText);
  const isOnsite = /\bon.?site\b|\bin.?office\b|\boffice only\b|\boffice.?based\b|\bin person\b|\bin-person\b/i.test(fullText);
  const isHybrid = /\bhybrid\b/i.test(fullText);
  const WARSAW_RE = /\bwarsaw\b|\bwarszawa\b|\bmazowieckie\b|\bmasovian\b|\bmasovia\b|\bmasovian\s*voivodeship\b/i;
  const WARSAW_POSTAL = /\b0[0-4]\d-\d{3}\b/;
  const isWarsaw = WARSAW_RE.test(locationText) || WARSAW_RE.test(text)
    || WARSAW_POSTAL.test(locationText) || WARSAW_POSTAL.test(text);
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

  const salarySource = `${jobData.salary || ""} ${jobData.description || ""}`;
  const SALARY_NOISE = /\b(relocation|bonus|allowance|package|reimbursement|referral|signing|voucher|subsidy|benefit|reward|incentive|commission)\b/i;
  const HOURLY_PATTERN = /(\d[\d,.]*\d|\d)\s*(pln|z[łl]|zloty)\s*\/?\s*(h\b|hr\b|hour|godzin)/i;
  const plnPattern = /(\d[\d,.]*\d|\d)\s*(pln|z[łl]|zloty)/gi;
  const plnNums = [];
  let plnM;
  while ((plnM = plnPattern.exec(salarySource)) !== null) {
    const start = Math.max(0, plnM.index - 60);
    const end = Math.min(salarySource.length, plnM.index + plnM[0].length + 60);
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
    const hourlyMatch = HOURLY_PATTERN.exec(salarySource);
    let monthly;
    if (hourlyMatch) {
      const hourly = parseFloat(hourlyMatch[1].replace(/[,\s]/g, ''));
      monthly = hourly * 8 * 22;
    } else {
      monthly = isAnnual ? lowest / 12 : isMonthly ? lowest : lowest > 20000 ? lowest / 12 : lowest;
    }
    if (monthly < 3000) autoFailReasons.push("Salary below 3000 PLN");
  }
  let detectedCategory = "unknown";
  for (const [cat, keywords] of Object.entries(ROLE_CATEGORIES)) {
    if (keywords.some(kw => text.includes(kw))) { detectedCategory = cat; break; }
  }

  if (autoFailReasons.length > 0) {
    return {
      score: 0, colour: "fail", recommendation: "Auto Fail",
      autoFail: true, autoFailReason: autoFailReasons.join(" · "),
      category: detectedCategory,
      cvSelection: selectCV(detectedCategory, text),
      positiveMatches: [], negativeMatches: [],
      redFlags: [], skillMatches: [],
      flags: autoFailReasons,
      isRemote, isOnsite, isWarsawJob: isWarsaw,
      locationNote: "", estimatedTime: "~5 min",
      summary: `Auto Fail: ${autoFailReasons[0]}`
    };
  }

  // ─── Build score from zero ────────────────────────────────────────────────
  let score = 0;
  const positiveMatches = [];
  const negativeMatches = [];
  const redFlags = [];
  const skillMatches = [];

  // Step 2 — Role Match
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

  // Step 4 — Experience Required
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

  // Step 5 — Skills Overlap
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

  // Step 8 — Transferability bonus for ops/admin roles (FIX 8)
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
    { pattern: /\b(temporary\s*contract|fixed.?term\s*contract|contract\s*role|short.?term\s*contract|temp\s*role|temporary\s*position)\b/i, message: "Temporary/fixed-term contract" },
    { pattern: /\b(self.employed|b2b\s*(only|contract)|business.?to.?business|freelance\s*(only|contract)|must\s*be\s*self.employed|contractor\s*only|no\s*employment\s*contract|sole\s*trader|own\s*company\s*required)\b/i, message: "B2B/self-employed contract only — no employment contract" }
  ];
  for (const { pattern, message } of redFlagChecks) {
    if (pattern.test(text)) redFlags.push(message);
  }

  // Permanent contract bonus (+5)
  if (/\b(permanent\s*position|permanent\s*contract|full.?time\s*permanent|indefinite\s*contract|umowa\s*na\s*czas\s*nieokre[sś]lony)\b/i.test(text)) {
    score += 5;
    positiveMatches.push({ message: "Permanent full-time position", points: 5 });
  }

  // Temp contract score penalty (-25)
  const TEMP_CONTRACT_RE = /\b(temporary\s*contract|fixed.?term|contract\s*length|3.month\s*contract|6.month\s*contract|short.?term\s*contract|temp\s*role|temporary\s*position)\b/i;
  if (TEMP_CONTRACT_RE.test(text)) {
    score = Math.max(0, score - 25);
    negativeMatches.push({ message: "Temporary/fixed-term contract (not permanent)", points: -25 });
  }

  // Polish language proficiency penalty (-35) or auto-fail for C1/C2
  const POLISH_C1C2 = /\b(polish|język polski)\s*(c1|c2|native|fluent|biegły|biegle)\b/i;
  const POLISH_C1C2_REV = /\b(c1|c2|native|fluent|biegły|biegle)\s*(polish|język polski)\b/i;
  const POLISH_PHRASES = /\b(biegła znajomość języka polskiego|native polish|fluent polish required)\b/i;
  const POLISH_REQUIRED = /\b(polish)\b.*?\b(c1|c2|fluent|native|proficient|advanced|required|mandatory|must)\b/i;
  const POLISH_REQUIRED_REV = /\b(c1|c2|fluent|native|proficient|advanced|required|mandatory|must)\b.*?\b(polish)\b/i;
  const POLISH_OPTIONAL = /\b(optional|nice to have|advantage|asset|preferred|plus|beneficial|desirable|welcome)\b/i;
  const polishSentences = text.split(/[.!?\n]+/);
  let polishAutoFail = false;
  for (const sentence of polishSentences) {
    if ((POLISH_C1C2.test(sentence) || POLISH_C1C2_REV.test(sentence) || POLISH_PHRASES.test(sentence)) && !POLISH_OPTIONAL.test(sentence)) {
      polishAutoFail = true; break;
    }
  }
  if (polishAutoFail) {
    return {
      score: 0, colour: "fail", recommendation: "Auto Fail",
      autoFail: true, autoFailReason: "Requires professional Polish (C1/C2) — Carlton's Polish is not at this level",
      category: detectedCategory, cvSelection: selectCV(detectedCategory, text),
      positiveMatches: [], negativeMatches: [], redFlags: [], skillMatches: [],
      flags: ["Requires professional Polish (C1/C2) — Carlton's Polish is not at this level"],
      isRemote, isOnsite, isWarsawJob: isWarsaw, locationNote: "", estimatedTime: "~5 min",
      summary: "Auto Fail: Requires professional Polish (C1/C2) — Carlton's Polish is not at this level"
    };
  }
  for (const sentence of polishSentences) {
    if ((POLISH_REQUIRED.test(sentence) || POLISH_REQUIRED_REV.test(sentence)) && !POLISH_OPTIONAL.test(sentence)) {
      score = Math.max(0, score - 35);
      negativeMatches.push({ message: "Polish language proficiency required (not held)", points: -35 });
      break;
    }
  }
  if ((jobData.description || "").length < 300) redFlags.push("Vague job description");

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
    cvSelection: selectCV(detectedCategory, text),
    positiveMatches, negativeMatches,
    redFlags, skillMatches,
    flags: [...negativeMatches.map(n => n.message), ...redFlags],
    isRemote, isOnsite, isWarsawJob: isWarsaw,
    locationNote, estimatedTime,
    summary: buildScoreSummary(score, recommendation, positiveMatches, negativeMatches, redFlags)
  };
}

function buildScoreSummary(score, recommendation, positive, negative, redFlags) {
  const lines = [`Score: ${score}/100 — ${recommendation}`];
  if (positive.length > 0) {
    lines.push("\nStrengths:");
    positive.slice(0, 3).forEach(p => lines.push(`  ✓ ${p.message}`));
  }
  const realNegatives = negative.filter(n => n.points !== 0);
  if (realNegatives.length > 0 || redFlags.length > 0) {
    lines.push("\nConcerns:");
    realNegatives.forEach(n => lines.push(`  ✗ ${n.message}`));
    redFlags.forEach(f => lines.push(`  ⚠ ${f}`));
  }
  return lines.join("\n");
}
