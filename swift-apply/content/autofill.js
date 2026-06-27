// Autofill engine — fills application form fields with Carlton's data
// Uses human-like delays between actions to avoid bot detection

import { AUTOFILL_DATA } from '../lib/profile.js';

/**
 * Random delay between min and max ms
 */
function delay(min = 100, max = 400) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Simulate human-like typing into an input field
 */
async function humanType(element, value) {
  element.focus();
  await delay(50, 150);

  // Clear existing value
  element.value = "";
  element.dispatchEvent(new Event('input', { bubbles: true }));
  await delay(30, 80);

  // Set value directly (more reliable than char-by-char for most frameworks)
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(element, value);
  } else {
    element.value = value;
  }

  // Fire events that React/Vue/Angular listen to
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  await delay(100, 300);
}

/**
 * Fill a textarea
 */
async function fillTextarea(element, value) {
  element.focus();
  await delay(50, 150);
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  await delay(100, 250);
}

/**
 * Select a value from a dropdown
 */
async function selectOption(element, value) {
  element.focus();
  await delay(50, 150);

  const options = Array.from(element.options);
  const valueLower = value.toLowerCase();

  // Try exact match first, then partial
  let matched = options.find(o => o.value.toLowerCase() === valueLower || o.text.toLowerCase() === valueLower);
  if (!matched) {
    matched = options.find(o => o.value.toLowerCase().includes(valueLower) || o.text.toLowerCase().includes(valueLower));
  }

  if (matched) {
    element.value = matched.value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    await delay(100, 200);
    return true;
  }
  return false;
}

/**
 * Field matcher — maps field labels/names/ids to Carlton's data
 */
const FIELD_MATCHERS = [
  // Name fields
  { patterns: [/^(full.?name|name)$/i, /fullname/i], value: AUTOFILL_DATA.fullName },
  { patterns: [/^first.?name$/i, /firstname/i], value: AUTOFILL_DATA.firstName },
  { patterns: [/^last.?name$/i, /lastname|surname/i], value: AUTOFILL_DATA.lastName },

  // Contact
  { patterns: [/^email$/i, /e.?mail/i], value: AUTOFILL_DATA.email },
  { patterns: [/^phone$/i, /telephone|mobile|cell/i], value: AUTOFILL_DATA.phone },

  // Location
  { patterns: [/^(city|town)$/i], value: AUTOFILL_DATA.city },
  { patterns: [/^country$/i], value: AUTOFILL_DATA.country },
  { patterns: [/^(location|address)$/i, /current.?location/i], value: AUTOFILL_DATA.location },
  { patterns: [/^(zip|postal).?code$/i], value: "02-685" },

  // Professional
  { patterns: [/current.?(?:job.?)?title|position.?title|job.?title/i], value: AUTOFILL_DATA.currentJobTitle },
  { patterns: [/current.?(?:employer|company)/i], value: AUTOFILL_DATA.currentCompany },
  { patterns: [/years.?of.?exp|experience.?years/i], value: AUTOFILL_DATA.yearsExperience },
  { patterns: [/linkedin/i], value: AUTOFILL_DATA.linkedin },
  { patterns: [/portfolio|website|personal.?site/i], value: AUTOFILL_DATA.portfolio },

  // Work authorisation
  { patterns: [/work.?auth|right.?to.?work|visa|authoris/i], value: AUTOFILL_DATA.workAuthorisation },
  { patterns: [/require.?sponsor|sponsorship/i], value: AUTOFILL_DATA.requireSponsorship },

  // Preferences
  { patterns: [/remote|work.?from.?home/i], value: AUTOFILL_DATA.remotePreference },
  { patterns: [/relocat/i], value: AUTOFILL_DATA.willingToRelocate },
  { patterns: [/notice.?period|availability|start.?date/i], value: AUTOFILL_DATA.noticePeriod },

  // Language
  { patterns: [/english.?level|english.?proficiency/i], value: AUTOFILL_DATA.englishProficiency },

  // Education
  { patterns: [/university|school|institution|college/i], value: AUTOFILL_DATA.university },
  { patterns: [/degree|education.?level/i], value: AUTOFILL_DATA.educationLevel },
  { patterns: [/graduation.?year|grad.?year/i], value: AUTOFILL_DATA.graduationYear },
];

/**
 * Match a field to Carlton's data based on name/id/label/placeholder
 */
function matchField(element) {
  const attrs = [
    element.name,
    element.id,
    element.placeholder,
    element.getAttribute('aria-label'),
    element.getAttribute('data-field'),
    element.getAttribute('autocomplete')
  ].map(v => (v || "").toLowerCase());

  // Also check associated label text
  const labelText = getLabelText(element).toLowerCase();
  attrs.push(labelText);

  for (const matcher of FIELD_MATCHERS) {
    for (const pattern of matcher.patterns) {
      if (attrs.some(attr => attr && pattern.test(attr))) {
        return matcher.value;
      }
    }
  }

  // Autocomplete attribute hints
  const autocomplete = element.getAttribute('autocomplete') || '';
  const autocompleteMap = {
    'name': AUTOFILL_DATA.fullName,
    'given-name': AUTOFILL_DATA.firstName,
    'family-name': AUTOFILL_DATA.lastName,
    'email': AUTOFILL_DATA.email,
    'tel': AUTOFILL_DATA.phone,
    'tel-national': AUTOFILL_DATA.phoneAlternate,
    'address-line1': AUTOFILL_DATA.location,
    'address-level2': AUTOFILL_DATA.city,
    'country': AUTOFILL_DATA.country,
    'country-name': AUTOFILL_DATA.country,
    'postal-code': "02-685",
    'organization': AUTOFILL_DATA.currentCompany,
    'organization-title': AUTOFILL_DATA.currentJobTitle,
    'url': AUTOFILL_DATA.portfolio
  };

  if (autocomplete && autocompleteMap[autocomplete]) {
    return autocompleteMap[autocomplete];
  }

  return null;
}

/**
 * Get label text for a form element
 */
function getLabelText(element) {
  // Check for associated label via 'for' attribute
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label) return label.textContent.trim();
  }
  // Check for wrapping label
  const parentLabel = element.closest('label');
  if (parentLabel) return parentLabel.textContent.trim();
  // Check aria-labelledby
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const el = document.getElementById(labelledBy);
    if (el) return el.textContent.trim();
  }
  return "";
}

/**
 * Main autofill function — fills all detectable form fields on the page
 * Returns a summary of what was filled
 */
export async function autofillPage() {
  const filled = [];
  const skipped = [];

  const inputs = Array.from(document.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea, select'
  ));

  for (const input of inputs) {
    // Skip invisible or disabled fields
    if (!input.offsetParent && input.type !== 'email') continue;
    if (input.disabled || input.readOnly) continue;

    // Skip already filled fields (unless they look wrong)
    const currentValue = (input.value || "").trim();
    if (currentValue && currentValue.length > 2) {
      skipped.push({ field: input.name || input.id || input.type, reason: "already filled" });
      continue;
    }

    const matchedValue = matchField(input);

    if (!matchedValue && matchedValue !== "") {
      skipped.push({ field: input.name || input.id || input.placeholder || "unknown", reason: "no match" });
      continue;
    }

    // Skip salary fields — leave blank unless required
    const fieldHint = `${input.name} ${input.id} ${input.placeholder} ${getLabelText(input)}`.toLowerCase();
    if (/salary|compensation|pay|rate|expectation|desired/i.test(fieldHint)) {
      skipped.push({ field: fieldHint.trim(), reason: "salary field — left blank" });
      continue;
    }

    try {
      await delay(200, 600); // human-like pause between fields

      if (input.tagName === "SELECT") {
        const success = await selectOption(input, matchedValue);
        if (success) {
          filled.push({ field: input.name || input.id, value: matchedValue });
        }
      } else if (input.tagName === "TEXTAREA") {
        await fillTextarea(input, matchedValue);
        filled.push({ field: input.name || input.id, value: matchedValue });
      } else {
        await humanType(input, matchedValue);
        filled.push({ field: input.name || input.id, value: matchedValue });
      }
    } catch (e) {
      skipped.push({ field: input.name || input.id, reason: `error: ${e.message}` });
    }
  }

  return { filled, skipped, total: inputs.length };
}

/**
 * Fill only specific fields by label text search
 */
export async function fillSpecificField(labelOrName, value) {
  const inputs = document.querySelectorAll('input, textarea, select');
  for (const input of inputs) {
    const labelText = getLabelText(input).toLowerCase();
    const name = (input.name || "").toLowerCase();
    const id = (input.id || "").toLowerCase();
    const placeholder = (input.placeholder || "").toLowerCase();
    const search = labelOrName.toLowerCase();

    if (labelText.includes(search) || name.includes(search) || id.includes(search) || placeholder.includes(search)) {
      await humanType(input, value);
      return true;
    }
  }
  return false;
}
