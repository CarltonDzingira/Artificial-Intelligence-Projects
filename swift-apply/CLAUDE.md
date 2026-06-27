# SwiftApply Chrome Extension

## Project Overview
Chrome Extension MV3 — scores jobs, tailors CVs, generates cover letters, autofills forms, tracks applications, generates LinkedIn connection messages.

## Current Version
2.3.0

## Tech Stack
- Vanilla JS content script (content/content.js)
- Service Worker (background/service-worker.js)
- Scoring library (lib/scorer.js)
- jsPDF for PDF generation (lib/jspdf.bundle.mjs)
- Gemini 2.5 Flash — primary AI
- Ollama gemma3:4b — local fallback (installed on Carlton's HP EliteBook 8GB RAM)
- No Perplexity — removed from scope

## File Structure
content/content.js — all UI, sidebar, autofill, PDF, LinkedIn
background/service-worker.js — all API calls (Gemini + Ollama)
lib/scorer.js — job scoring algorithm
sidebar/sidebar.css — all styles
options/options.html + options.js — settings page
assets/templates/ — 4 CV Word templates (reference only)
lib/jspdf.bundle.mjs — PDF generation

## AI Routing — THREE LAYERS ALWAYS
1. Gemini 2.5 Flash — primary for all calls; auto-switches to Ollama at 250 calls/day
2. Ollama gemma3:4b — automatic fallback when Gemini returns 429, quota error, or daily limit hit
3. Descriptive error — only if both fail, always explains what to do
Default Ollama model: gemma3:4b
Quota: badge shows 80% at 200 calls, MAX at 250. GET_QUOTA_STATUS message returns { callsToday, limit, percentage }.
Heartbeat: chrome.alarms checks Ollama every 30 minutes. Sends notification if Ollama goes offline.

## Architecture Rules
- Never auto-tailor on sidebar open — only on user button click
- CV uses structured JS data objects not Word XML (keys: summary, skills, bullets_job1, bullets_job2)
- PDF uses jsPDF only
- Never submit forms — user always submits manually
- LinkedIn profile pages require manual Read Profile click
- LinkedIn rate limit: 10 uses per 10 minutes
- All sidebar element lookups use sid() helper not document.getElementById
- Session recovery: pending CV/cover ops saved to sessionStorage; resume banner shown on next sidebar open within 5 min
- Description selector scoring: pick highest (length × keyword_density) not first match

## Scoring
- Auto-fail: foreign language required (title or desc), Polish C1/C2 required, non-Warsaw onsite/hybrid, explicit relocation, salary below 3000 PLN (only when salary context words present)
- Salary context check: PLN number only checked against 3000 threshold when near: salary, wynagrodzenie, gross, net, monthly, brutto, netto etc.
- Hourly rate: converted to monthly (×176) before threshold check
- Benefits bonus up to +12 points
- Entry level +15, Direct employer +3
- Thresholds: 90-100 Perfect, 75-89 Strong, 60-74 Decent, 40-59 Weak, below 40 Poor, 0 Fail
- B2B/self-employed only roles: red flag warning (not auto-fail)
- CV tailoring keys: bullets_job1 = Teleperformance bullets, bullets_job2 = Empire bullets

## Carlton's Profile
Name: Carlton Fredrick Dzingira
Email: fredrickcarlton@gmail.com
Phone: +48577327906
DOB: 13 February 2003
Location: Warsaw, Poland — Stefana Bryly 3
Current: Operations Expert, Teleperformance Warsaw (April 2025-present)
Previous: Dispatcher, Empire National Poland (Feb 2022-Dec 2024)
Education: BSc Computer Engineering, Vistula University Warsaw (graduating 2026)
English: C1

## Claude Code Session Rules
- Run /compact every 20 messages
- Read only specific files mentioned in the task
- Never read all files at once
- One feature per session
- State exact problem and file before asking for help
