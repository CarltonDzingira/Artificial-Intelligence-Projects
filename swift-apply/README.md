# ⚡ SwiftApply — AI-Powered Job Application Assistant

> An intelligent Chrome extension that analyses job postings, matches them to your experience, generates tailored application documents, tracks your applications, and helps you apply faster—while keeping you fully in control.

---

# What is SwiftApply?

SwiftApply is an AI-powered Chrome extension designed to simplify and improve the job application process.

Instead of manually reading every vacancy, rewriting your CV, creating a new cover letter, and filling out repetitive application forms, SwiftApply performs these tasks in seconds.

The extension analyses each job posting using Google's Gemini AI, determines how well it matches your profile, customises your CV, generates a personalised cover letter, and can automatically populate many online application forms.

Unlike automated job bots, **SwiftApply never submits applications on your behalf**. Every application is reviewed and submitted manually by you.

---

# Key Features

### 🤖 AI Job Match Scoring

* Analyses job descriptions using Google Gemini AI
* Produces a match score (0–100)
* Explains why a role matches—or doesn't
* Helps prioritise worthwhile applications

---

### 📄 Intelligent CV Tailoring

SwiftApply automatically selects the most suitable CV template for the role and customises it to better match the job description.

Features include:

* Selecting the best CV for the position
* Tailoring skills and experience
* Optimising keywords
* Maintaining ATS-friendly formatting
* Downloading the tailored CV as a document

---

### 📝 AI Cover Letter Generation

For every analysed job, SwiftApply generates a personalised cover letter based on:

* The job description
* Your experience
* Your selected CV
* Relevant skills

The generated cover letter can be downloaded for future use or editing.

---

### ⚡ Smart Form Autofill

SwiftApply automatically fills many online job application forms with your saved information.

Supported fields include:

* Personal information
* Contact details
* Employment history
* Education
* Skills
* CV uploads (where supported)

The extension never presses the Submit button.

---

### 📊 Job Tracking Dashboard

SwiftApply keeps track of your job search by recording:

* Jobs viewed
* Jobs analysed
* Jobs you've applied for
* Match scores
* Application status

This helps users monitor their progress without maintaining a separate spreadsheet.

---

### 🎯 Role-Focused AI

SwiftApply is currently optimised for identifying and tailoring applications for roles such as:

* IT Support
* Technical Support
* Customer Support
* Help Desk
* QA / Game Testing
* Operations
* Administration
* Dispatcher
* Platform Operations
* Similar technology and support-based positions

The architecture is modular, allowing additional career paths and CV templates to be added in future versions.

---

### 🔒 Privacy First

* API keys remain stored locally inside Chrome
* Applications are never submitted automatically
* User data is never shared except with Google's Gemini API for document generation
* Users remain in complete control throughout the application process

---

# Workflow

1. Open a job posting in Chrome.
2. Click the ⚡ SwiftApply extension.
3. Analyse the vacancy.
4. Review the AI-generated match score.
5. Read the explanation for the score.
6. Generate a tailored CV.
7. Generate a personalised cover letter.
8. Download both documents if desired.
9. Autofill the application form.
10. Review everything.
11. Submit the application manually.

---

# Requirements

## Google Chrome

SwiftApply is built as a Chrome Extension (Manifest V3) and currently supports Google Chrome.

---

## Google Gemini API Key

A free Google Gemini API key is required.

The API is used for:

* Job analysis
* Match scoring
* CV tailoring
* Cover letter generation

The free tier is sufficient for normal job searching.

---

# Installation

## 1. Download the repository

Clone the repository or download the ZIP archive.

## 2. Load the extension

* Open Chrome
* Visit `chrome://extensions`
* Enable **Developer Mode**
* Select **Load unpacked**
* Choose the `swift-apply` folder

## 3. Configure your API Key

* Open SwiftApply
* Navigate to Settings
* Paste your Gemini API Key
* Save
* Test the connection

---

# Supported Platforms

* LinkedIn
* Indeed
* Glassdoor
* Pracuj.pl
* Hiring Cafe
* Company career websites

---

# Technologies

* JavaScript (ES6)
* Chrome Extension Manifest V3
* Google Gemini API
* HTML5
* CSS3
* Prompt Engineering
* DOM Manipulation
* Local Storage
* AI-powered document generation

---

# Current CV Templates

SwiftApply currently includes specialised CV templates for:

| Template         | Target Roles                                                             |
| ---------------- | ------------------------------------------------------------------------ |
| IT Support       | IT Support, Help Desk, Technical Support, QA, Security, Game Testing     |
| Customer Support | Customer Service, Support Agent, Customer Success                        |
| Operations       | Operations, Dispatcher, Coordinator, Platform Operations, Administration |

Additional templates can easily be added through the modular profile system.

---

# Project Structure

```text
swift-apply/
├── assets/
├── background/
├── content/
├── lib/
├── options/
├── popup/
├── scripts/
├── sidebar/
├── manifest.json
├── package.json
└── README.md
```

---

# Future Improvements

Planned enhancements include:

* Additional career-specific CV templates
* Support for more job boards
* AI interview preparation
* Resume analytics
* Application success statistics
* Multi-language support
* Cloud synchronisation
* Application reminders

---

# License

MIT License © 2026 Carlton Dzingira

---

# Author

**Carlton Dzingira**

AI Developer • Software Engineer • Automation Enthusiast

Built to demonstrate practical applications of Large Language Models, browser automation, prompt engineering, and AI-assisted productivity tools.
