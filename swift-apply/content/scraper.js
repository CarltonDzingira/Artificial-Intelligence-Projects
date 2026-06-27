// Job description scraper — extracts job data from any job posting page

/**
 * Site-specific scraper configurations
 * Each entry maps a hostname pattern to CSS selectors for job fields
 */
const SITE_CONFIGS = {
  "indeed.com": {
    title: [
      ".jobsearch-JobInfoHeader-title",
      "[data-testid='jobsearch-JobInfoHeader-title']",
      "h1.jobTitle",
      "h1[class*='title']"
    ],
    company: [
      "[data-testid='inlineHeader-companyName']",
      ".jobsearch-InlineCompanyRating-companyHeader",
      "[class*='companyName']"
    ],
    location: [
      "[data-testid='job-location']",
      "[class*='companyLocation']",
      "[class*='location']"
    ],
    description: [
      "#jobDescriptionText",
      "[class*='jobDescription']",
      "[data-testid='jobDescription']"
    ],
    salary: [
      "[class*='salary']",
      "[data-testid*='salary']"
    ]
  },

  "glassdoor.com": {
    title: [
      "[data-test='job-title']",
      ".job-title",
      "h1[class*='title']",
      "[class*='JobTitle']"
    ],
    company: [
      "[data-test='employer-name']",
      "[class*='employerName']",
      "[class*='EmployerName']"
    ],
    location: [
      "[data-test='location']",
      "[class*='location']",
      "[class*='Location']"
    ],
    description: [
      "[class*='jobDescriptionContent']",
      "[data-test='jobDescriptionContent']",
      "[class*='JobDescription']",
      "#JobDescriptionContainer"
    ],
    salary: [
      "[data-test='detailSalary']",
      "[class*='salary']"
    ]
  },

  "hiring.cafe": {
    title: ["h1", ".job-title", "[class*='title']"],
    company: [".company-name", "[class*='company']"],
    location: [".location", "[class*='location']"],
    description: [".job-description", ".description", "article", "main"],
    salary: [".salary", "[class*='salary']", "[class*='compensation']"]
  },

  "pracuj.pl": {
    title: ["h1[data-test='text-positionName']", "h1", ".offer-title"],
    company: ["[data-test='text-employerName']", ".employer-name"],
    location: ["[data-test='text-workLocationCity']", ".location"],
    description: ["[data-test='section-description']", ".offer-description", ".description"],
    salary: ["[data-test='text-salary']", ".salary"]
  },

  "linkedin.com": {
    title: [".job-details-jobs-unified-top-card__job-title", "h1.t-24", "h1"],
    company: [".job-details-jobs-unified-top-card__company-name", ".topcard__org-name-link"],
    location: [".job-details-jobs-unified-top-card__bullet", ".topcard__flavor--bullet"],
    description: [".jobs-description__content", ".jobs-description", "#job-details"],
    salary: [".jobs-salary", "[class*='salary']"]
  }
};

/**
 * Generic fallback selectors used when no site config matches
 */
const GENERIC_SELECTORS = {
  title: [
    "h1", ".job-title", ".position-title", ".posting-title",
    "[class*='jobTitle']", "[class*='job-title']", "[class*='position']",
    "[itemprop='title']", "[data-automation='job-title']"
  ],
  company: [
    ".company", ".employer", ".company-name", ".org-name",
    "[class*='company']", "[class*='employer']", "[class*='organization']",
    "[itemprop='hiringOrganization']"
  ],
  location: [
    ".location", ".job-location", ".workplace",
    "[class*='location']", "[class*='workplace']",
    "[itemprop='jobLocation']"
  ],
  description: [
    ".job-description", ".description", ".posting-description",
    "[class*='jobDescription']", "[class*='job-description']",
    "[class*='description']", "article", "main", "#main-content",
    "[itemprop='description']"
  ],
  salary: [
    ".salary", ".compensation", ".pay",
    "[class*='salary']", "[class*='compensation']", "[class*='pay']"
  ]
};

/**
 * Find the site config for the current page
 */
function getSiteConfig() {
  const hostname = window.location.hostname.toLowerCase();
  for (const [site, config] of Object.entries(SITE_CONFIGS)) {
    if (hostname.includes(site)) return config;
  }
  return null;
}

/**
 * Try multiple selectors, return text from first match
 */
function trySelectors(selectors, defaultValue = "") {
  for (const selector of selectors) {
    try {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim()) {
        return el.textContent.trim();
      }
    } catch (e) {
      // invalid selector, skip
    }
  }
  return defaultValue;
}

/**
 * Get full description text, trying multiple elements and combining if needed
 */
function extractDescription(selectors) {
  for (const selector of selectors) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        const text = el.innerText || el.textContent;
        if (text && text.trim().length > 200) {
          return text.trim();
        }
      }
    } catch (e) { /* skip */ }
  }

  // Fallback: grab the longest text block on the page
  const candidates = document.querySelectorAll("div, section, article");
  let longest = "";
  for (const el of candidates) {
    const text = (el.innerText || el.textContent || "").trim();
    if (text.length > longest.length && text.length < 20000) {
      // Make sure it actually looks like a job description
      if (/responsibilit|requirement|qualif|experience|skills|duties/i.test(text)) {
        longest = text;
      }
    }
  }
  return longest;
}

/**
 * Main scrape function — call this to get job data from current page
 */
export function scrapeJobData() {
  const siteConfig = getSiteConfig();
  const titleSelectors = siteConfig?.title || GENERIC_SELECTORS.title;
  const companySelectors = siteConfig?.company || GENERIC_SELECTORS.company;
  const locationSelectors = siteConfig?.location || GENERIC_SELECTORS.location;
  const descriptionSelectors = siteConfig?.description || GENERIC_SELECTORS.description;
  const salarySelectors = siteConfig?.salary || GENERIC_SELECTORS.salary;

  const title = trySelectors(titleSelectors) || document.title.split(/[-|–]/)[0].trim();
  const company = trySelectors(companySelectors);
  const location = trySelectors(locationSelectors);
  const description = extractDescription(descriptionSelectors);
  const salary = trySelectors(salarySelectors);

  return {
    title: cleanText(title),
    company: cleanText(company),
    location: cleanText(location),
    salary: cleanText(salary),
    description: description,
    url: window.location.href,
    scrapedAt: new Date().toISOString(),
    siteName: getSiteName()
  };
}

function cleanText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function getSiteName() {
  const hostname = window.location.hostname.toLowerCase();
  if (hostname.includes("indeed")) return "Indeed";
  if (hostname.includes("glassdoor")) return "Glassdoor";
  if (hostname.includes("linkedin")) return "LinkedIn";
  if (hostname.includes("hiring.cafe")) return "Hiring Cafe";
  if (hostname.includes("pracuj")) return "Pracuj.pl";
  return hostname.replace("www.", "");
}

/**
 * Check if the current page looks like a job posting
 */
export function isJobPostingPage() {
  const url = window.location.href.toLowerCase();
  const title = document.title.toLowerCase();
  const bodyText = (document.body.innerText || "").substring(0, 2000).toLowerCase();

  const urlSignals = /job|career|position|vacancy|role|hiring|apply|recruit/i.test(url);
  const titleSignals = /job|position|vacancy|role|hiring|apply/i.test(title);
  const contentSignals = /job description|responsibilities|requirements|qualifications|we are looking/i.test(bodyText);

  return urlSignals || titleSignals || contentSignals;
}
