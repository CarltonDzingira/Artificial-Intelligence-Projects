# ⚡ SwiftApply — Smart Job Application Assistant

> A Chrome browser extension that reads job postings, scores how well they match your profile, writes a tailored cover letter, and fills in application forms for you — all before you click anything.

---

## What This Does (Plain English)

You open a job posting in Chrome. You click the ⚡ SwiftApply button. A panel slides in on the right side of the page showing:

- A **match score** (0–100) telling you if the job is worth applying for
- A **reason breakdown** — why it matched or didn't
- A **tailored CV** selected and adjusted for that specific role
- A **custom cover letter** written for that job
- Buttons to **auto-fill the application form** or skip

You are always in control. SwiftApply never submits anything on your behalf — it only fills fields and hands the form back to you.

---

## Before You Start — You Need Two Things

### 1. Google Chrome
This is a Chrome browser extension. It only works in Google Chrome (not Firefox, Edge, or Safari).  
Download Chrome at: https://www.google.com/chrome

### 2. A Gemini API Key (Required — Free)
SwiftApply uses Google's Gemini AI to write cover letters, tailor your CV, and analyse job postings. Without an API key, **the extension will not run**.

The good news: **Gemini has a free tier** — no credit card required, no charges for normal use.

**How to get your free API key:**
1. Go to https://aistudio.google.com/apikey
2. Sign in with your Google account
3. Click **Create API Key**
4. Select **Create API key in new project**
5. Copy the key that appears
6. Store it somewhere safe — you won't be able to see it again

> The free tier allows up to 1,500 requests per day and 15 per minute — more than enough for job hunting.  
> Your API key is stored only on your own computer inside Chrome. It is never sent anywhere except directly to Google's servers when analysing a job.

---

## Installation

### Step 1 — Download the extension files

1. Go to this GitHub page: https://github.com/CarltonDzingira/ai-projects
2. Click the green **Code** button
3. Click **Download ZIP**
4. Once downloaded, **unzip the folder** (right-click → Extract All on Windows)
5. Open the unzipped folder. Inside you will find a folder called `swift-apply` — keep note of where this is saved.

### Step 2 — Load it into Chrome

1. Open **Google Chrome**
2. In the address bar at the top, type exactly: `chrome://extensions` and press Enter
3. In the top-right corner of that page, turn on **Developer mode** (there is a toggle switch)
4. Click the **Load unpacked** button that appears on the left
5. A file browser opens — navigate to and select the `swift-apply` folder you unzipped
6. Click **Select Folder**
7. SwiftApply will now appear in your extensions list with a ⚡ icon

### Step 3 — Pin the extension (so you can see it)

1. Click the **puzzle piece icon** (🧩) in the top-right corner of Chrome
2. Find **SwiftApply** in the list
3. Click the **pin icon** next to it
4. The ⚡ icon will now always show in your toolbar

### Step 4 — Add your API Key

1. Click the ⚡ icon in your Chrome toolbar
2. Click the **Settings (⚙)** icon inside the popup
3. Paste your Claude API key into the field
4. Click **Save API Key**
5. Click **Test Connection** — it should confirm it is working

---

## How to Use It

1. Go to any job posting (Indeed, LinkedIn, Glassdoor, Pracuj.pl, or any company careers page)
2. Click the ⚡ SwiftApply icon in your Chrome toolbar
3. Click **"Analyse This Job"**
4. Wait a few seconds while it reads the page and contacts Gemini AI
5. A panel opens on the right showing your results:

| What you see | What it means |
|---|---|
| 🟢 Score 75–100 | Strong match — worth applying |
| 🟢 Score 60–74 | Good shot — apply |
| 🟡 Score 45–59 | Weak match — consider carefully |
| 🔴 Score 1–44 | Poor fit — skip |

6. Review the tailored CV and cover letter
7. When ready, choose:
   - **Auto-Fill** — fills the application form fields on the page
   - **Apply Now** — same as Auto-Fill (you still click Submit yourself)
   - **Skip** — close the panel and move on

> SwiftApply **never submits** your application. You always click Submit.

---

## Supported Job Sites

- Indeed.com
- LinkedIn.com
- Glassdoor.com
- Pracuj.pl
- Hiring Cafe
- Any company careers page

---

## CV Templates (Built-in)

SwiftApply automatically picks the right CV based on the job type:

| CV Template | Used for |
|---|---|
| IT Support CV | IT Support, Help Desk, IT Analyst, Security, QA, Game Tester |
| Customer Support CV | Customer Service, Support Agent, Representative |
| Operations / Admin CV | Operations, Admin, Coordinator, Platform Ops, Real Time Manager, Dispatcher |

---

## Project Structure (For Developers)

```
swift-apply/
├── manifest.json              # Extension config (MV3)
├── background/
│   └── service-worker.js      # Handles Gemini API calls
├── content/
│   └── content.js             # Sidebar + job scraper + autofill
├── sidebar/
│   └── sidebar.css            # Sidebar styles
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/
│   ├── options.html           # Settings page
│   ├── options.css
│   └── options.js
├── lib/
│   ├── profile.js             # Profile + CV templates
│   ├── scorer.js              # Job scoring engine
│   └── gemini-api.js          # Gemini API integration
└── assets/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Troubleshooting

**The extension icon is not showing**  
→ Click the 🧩 puzzle piece in Chrome's toolbar and pin SwiftApply.

**"API key not found" or cover letter not generating**  
→ Go to Settings (⚙) and re-paste your Gemini API key. Make sure you clicked Save.

**"Test Connection" fails**  
→ Check that your API key was copied in full (no spaces at the start or end). You can generate a new one at aistudio.google.com/apikey — it's free.

**The sidebar opens but the score does not load**  
→ Refresh the job posting page and try again. Some pages load slowly.

**Auto-fill did not work on a form**  
→ Not all application forms are built the same way. Fill the remaining fields manually and submit as normal.

---

## License

MIT License — © 2026 Carlton Dzingira

Permission is granted to use and share this project, provided the original author is credited. This project may not be repackaged or sold without permission.

---

## Built by Carlton Dzingira
