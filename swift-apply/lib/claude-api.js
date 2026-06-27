// Claude API integration — CV tailoring and cover letter generation

import { PROFILE, CV_TEMPLATES } from './profile.js';

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

/**
 * Get the stored API key from Chrome storage
 */
async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['claudeApiKey'], (result) => {
      resolve(result.claudeApiKey || null);
    });
  });
}

/**
 * Make a Claude API call via the background service worker
 */
async function callClaude(systemPrompt, userPrompt) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "CLAUDE_API_CALL",
        payload: { systemPrompt, userPrompt }
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        resolve(response.result);
      }
    );
  });
}

/**
 * Tailor a CV for a specific job posting
 */
export async function tailorCV(cvTemplate, jobData) {
  const cv = CV_TEMPLATES[cvTemplate];
  if (!cv) throw new Error(`Unknown CV template: ${cvTemplate}`);

  const systemPrompt = `You are a professional CV writer helping Carlton Dzingira tailor his CV for job applications.

Carlton's profile:
- 4 years operations/customer support/IT support experience
- Current: Operations Expert at Teleperformance, Warsaw (April 2025 - present)
- Previous: Dispatcher at Empire National Poland (Feb 2022 - Dec 2024)
- Education: BSc Computer Engineering (Year 3), Vistula University
- English C1, based in Warsaw Poland, seeking remote roles
- Target roles: IT Support, Customer Support, Operations, QA, Security (entry to mid-level)

Rules for tailoring:
1. NEVER fabricate experience, certifications, or skills Carlton doesn't have
2. Reorder skills to put the most relevant ones first
3. Adjust bullet points to mirror the job's language (use their keywords where honest)
4. Strengthen the professional summary to speak directly to this role
5. Keep the same structure and format
6. Output ONLY the tailored CV content in JSON format matching the input structure`;

  const userPrompt = `Tailor this CV for the following job:

JOB TITLE: ${jobData.title}
COMPANY: ${jobData.company || "Unknown"}
JOB DESCRIPTION:
${jobData.description.substring(0, 3000)}

BASE CV:
${JSON.stringify(cv, null, 2)}

Return a JSON object with the same structure as the base CV but tailored for this specific role. Include: summary, skills (array), experience (array with bullets), education, and optionally hobbies.`;

  try {
    const result = await callClaude(systemPrompt, userPrompt);
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return { ...cv, ...JSON.parse(jsonMatch[0]), tailored: true };
      }
    } catch (e) {
      // ignore parse error
    }
    return { ...cv, tailoredSummary: result, tailored: true };
  } catch (error) {
    console.error("CV tailoring failed:", error);
    return { ...cv, tailored: false, error: error.message };
  }
}

/**
 * Generate a custom cover letter for a job
 */
export async function generateCoverLetter(jobData, cvTemplate) {
  const cv = CV_TEMPLATES[cvTemplate];

  const systemPrompt = `You are a professional cover letter writer helping Carlton Dzingira apply for jobs.

Carlton's background:
- 4 years experience in operations, customer support, and IT support environments
- Current: Operations Expert at Teleperformance, Warsaw (handling 60-80 cases/day via chat/email)
- Previous: Dispatcher at Empire National Poland (90-100 daily interactions)
- BSc Computer Engineering student (Year 3), Vistula University, Warsaw
- English C1, calm under pressure, strong documentation and escalation skills
- Seeking remote, English-speaking roles (entry to mid-level)
- Location: Warsaw, Poland (EU work authorisation)

Writing style rules:
1. Professional but genuine — not robotic or over-the-top enthusiastic
2. 3-4 paragraphs maximum
3. Opening: connect Carlton's background to the specific role
4. Middle: 2-3 concrete examples of relevant experience
5. Closing: clear call to action, no cringe phrases like "I am writing to express my interest"
6. NEVER claim skills or experience Carlton doesn't have
7. Keep it under 350 words`;

  const userPrompt = `Write a cover letter for Carlton Dzingira applying to this role:

JOB TITLE: ${jobData.title}
COMPANY: ${jobData.company || "this company"}
LOCATION: ${jobData.location || "Remote"}
JOB DESCRIPTION:
${jobData.description.substring(0, 2500)}

Selected CV type: ${cv?.name || cvTemplate}

Write the full cover letter text only (no subject line or email headers needed).`;

  try {
    const result = await callClaude(systemPrompt, userPrompt);
    return { text: result, generated: true };
  } catch (error) {
    console.error("Cover letter generation failed:", error);
    return {
      text: getFallbackCoverLetter(jobData),
      generated: false,
      error: error.message
    };
  }
}

function getFallbackCoverLetter(jobData) {
  return `Dear Hiring Team,

I am applying for the ${jobData.title || "position"} at ${jobData.company || "your company"}. With 4 years of experience in operations and customer support environments, I bring a strong foundation in case handling, documentation, and escalation that aligns well with this role.

In my current position as Operations Expert at Teleperformance in Warsaw, I manage 60–80 cases daily via chat and email, consistently meeting quality and KPI targets. Previously as a Dispatcher at Empire National Poland, I handled 90–100 daily interactions coordinating time-sensitive operations under pressure — an environment that sharpened my communication, problem-solving, and documentation skills considerably.

I work well remotely, communicate clearly in English (C1), and thrive in structured, process-driven environments. I would welcome the opportunity to bring this experience to your team.

Best regards,
Carlton Dzingira
fredrickcarlton@gmail.com | +48577327906`;
}
