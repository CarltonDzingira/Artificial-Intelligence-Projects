// Carlton Dzingira's profile data — the source of truth for scoring and CV selection

export const PROFILE = {
  name: "Carlton Dzingira",
  email: "fredrickcarlton@gmail.com",
  phone: "+48577327906",
  location: "Warsaw, Poland",
  currentRole: "Operations Expert",
  employer: "Teleperformance",
  yearsExperience: 4,
  workAuthorisation: "EU/Poland",
  remoteOnly: true,
  englishLevel: "C1",
  education: "BSc Computer Engineering (Year 3), Vistula University, Warsaw",

  skills: [
    "customer support", "chat support", "email support", "phone support",
    "case management", "ticket management", "ticketing systems",
    "escalation handling", "issue escalation",
    "troubleshooting", "root cause analysis",
    "documentation", "reporting", "record keeping",
    "process compliance", "workflow execution",
    "kpi", "sla", "performance metrics",
    "stakeholder communication", "client communication",
    "scheduling", "prioritization", "time management",
    "microsoft office", "excel", "word", "outlook",
    "microsoft 365", "teams",
    "windows troubleshooting", "windows support",
    "it support", "help desk", "user support",
    "vpn", "lan", "wifi", "networking basics",
    "hardware setup", "peripheral setup",
    "remote support", "on-site basics",
    "operations coordination", "administrative support",
    "multitasking", "high-volume environments",
    "conflict resolution", "de-escalation",
    "python basics", "networking fundamentals",
    "risk analysis", "risk assessment"
  ],

  certifications: [
    "CompTIA Security+ (in progress)",
    "AWS Cloud Practitioner (planned)"
  ],

  targetRoles: [
    "it support", "help desk", "it analyst", "technical support",
    "cloud security analyst", "security engineer", "it risk analyst", "cybersecurity",
    "customer service", "customer support", "support agent", "customer representative",
    "operations expert", "operations coordinator", "platform operations",
    "operations manager", "administrative", "coordinator", "dispatcher",
    "game tester", "qa tester", "quality assurance"
  ],

  preferredLanguage: "English",
  salaryExpectation: null, // ask user if required
};

// CV Templates
export const CV_TEMPLATES = {
  it_support: {
    id: "it_support",
    name: "IT Support CV",
    summary: "IT Support and operations professional with 4 years experience in fast-paced, process-driven environments. Skilled in troubleshooting, ticket documentation, escalation, and supporting users through chat/email/phone while maintaining strong accuracy and service quality. Strong written communication (English C1) and calm under pressure.",
    skills: [
      "IT Support (Remote / On-site basics)",
      "Windows Troubleshooting (basic–intermediate)",
      "User Support & Step-by-Step Guidance",
      "Ticketing / Case Management & Documentation",
      "Issue Escalation & Clear Handover Notes",
      "VPN / LAN / Wi-Fi Troubleshooting (basic)",
      "Microsoft 365 / Teams (user support)",
      "Remote support & troubleshooting",
      "Hardware / Peripheral Setup (basic)",
      "Strong Written Communication (English C1)"
    ],
    experience: [
      {
        title: "Operations Expert",
        company: "Teleperformance",
        location: "Warsaw",
        dates: "04/2025 - Present",
        bullets: [
          "Handle 60–80 support cases daily via chat/email while maintaining accuracy, professionalism, and quality targets",
          "Troubleshoot customer issues by verifying account details, reproducing steps, and confirming resolution outcomes",
          "Document cases clearly with structured notes, supporting evidence, and escalation-ready summaries",
          "Follow strict workflows and compliance guidelines to ensure consistent case handling",
          "Identify recurring issues, report patterns, and escalate technical problems with detailed context"
        ]
      },
      {
        title: "Dispatcher",
        company: "Empire National Poland",
        location: "Warsaw, Poland",
        dates: "02/2022 - 12/2024",
        bullets: [
          "Managed 90–100 daily interactions (calls/messages) while coordinating time-sensitive operations",
          "Resolved urgent operational issues under pressure by collecting details, troubleshooting, and coordinating solutions",
          "Maintained accurate documentation, delivery notes, manifests, and supporting compliance records",
          "Communicated clearly with drivers, brokers, and clients to resolve disruptions and confirm outcomes",
          "Stayed calm and organized while handling high-volume calls and changing priorities"
        ]
      }
    ],
    education: "Bachelor of Science: Computer Engineering — Vistula University, Warsaw, Poland",
    hobbies: [
      "Fitness & strength training (consistent gym routine)",
      "Music (Spotify, playlists, live events)",
      "Student Housing Assistance — Helping international students secure accommodation through agency and landlord connections"
    ]
  },

  customer_support: {
    id: "customer_support",
    name: "Customer Support CV",
    summary: "Customer Support and Operations professional with 4 years experience in fast-paced, high-volume environments. Skilled in case handling, troubleshooting, documentation, and escalation while maintaining strong quality and accuracy. Experienced working with strict workflows, KPIs, and compliance requirements. Strong written communication (English C1) and calm under pressure.",
    skills: [
      "Customer Support (Chat, Email, Phone)",
      "Case Management & Ticket Documentation",
      "Troubleshooting & Root Cause Verification",
      "Escalation Handling & Clear Handover Notes",
      "Process Compliance & Workflow Accuracy",
      "KPI / SLA-Driven Performance",
      "Strong Written Communication (English C1)",
      "Conflict Resolution & De-escalation",
      "Microsoft Office (Excel, Word, Outlook)",
      "Time Management & Multitasking"
    ],
    experience: [
      {
        title: "Operations Expert",
        company: "Teleperformance",
        location: "Warsaw",
        dates: "04/2025 - Present",
        bullets: [
          "Handle 60–80 customer cases daily via chat/email while maintaining accuracy, professionalism, and quality targets",
          "Troubleshoot customer issues by verifying account details, reproducing steps, and confirming resolution outcomes",
          "Document cases clearly with structured notes, supporting evidence, and escalation-ready summaries",
          "Follow strict workflows and compliance guidelines to ensure consistent case handling",
          "Identify recurring issues, report patterns, and escalate technical problems with detailed context"
        ]
      },
      {
        title: "Dispatcher",
        company: "Empire National Poland",
        location: "Warsaw, Poland",
        dates: "02/2022 - 12/2024",
        bullets: [
          "Managed time-sensitive daily operations while maintaining accurate documentation and records",
          "Managed 90–100 daily interactions (calls/messages) with drivers, brokers, and clients",
          "Communicated clearly with stakeholders to resolve disruptions and deliver solutions",
          "Stayed calm and professional while handling high-volume calls and urgent requests",
          "Identified issues early, recorded key details, and resolved problems under pressure (delays, breakdowns, route changes)",
          "Maintained compliance-related documents including delivery notes, manifests, and supporting paperwork"
        ]
      }
    ],
    education: "Bachelor of Science: Computer Engineering — Vistula University, Warsaw, Poland",
    hobbies: [
      "Fitness & strength training (consistent gym routine)",
      "Music (Spotify, playlists, live events)",
      "Student Housing Assistance — Helping international students secure accommodation through agency and landlord connections"
    ]
  },

  operations: {
    id: "operations",
    name: "Operations / Admin CV",
    summary: "Operations and administrative professional with 4 years experience supporting fast-paced, process-driven environments. Skilled in documentation, coordination, stakeholder communication, and resolving issues under pressure while maintaining accuracy and compliance. Experienced working with strict workflows, KPIs, and deadlines. Strong written communication (English C1) and highly organized in high-volume work settings.",
    skills: [
      "Operations Coordination & Administrative Support",
      "Documentation, Reporting & Record Accuracy",
      "Process Compliance & Workflow Execution",
      "KPI / SLA-Driven Performance",
      "Stakeholder Communication (Clients, Teams, Vendors)",
      "Issue Tracking, Escalation & Follow-Up",
      "Scheduling, Prioritization & Time Management",
      "Attention to Detail & Quality Assurance",
      "Microsoft Office (Excel, Word, Outlook)",
      "Multitasking in High-Volume Environments"
    ],
    experience: [
      {
        title: "Operations Expert",
        company: "Teleperformance",
        location: "Warsaw",
        dates: "04/2025 - Present",
        bullets: [
          "Handle 60–80 customer cases daily via chat/email while maintaining accuracy, professionalism, and quality targets",
          "Follow strict workflows and compliance guidelines to ensure consistent case handling",
          "Document cases clearly with structured notes, supporting evidence, and escalation-ready summaries",
          "Identify recurring issues, report patterns, and escalate complex cases with detailed context",
          "Adapt quickly to new processes, internal updates, and policy changes while maintaining performance metrics"
        ]
      },
      {
        title: "Dispatcher",
        company: "Empire National Poland",
        location: "Warsaw, Poland",
        dates: "02/2022 - 12/2024",
        bullets: [
          "Managed time-sensitive daily operations while maintaining accurate documentation and records",
          "Managed 90–100 daily interactions (calls/messages) with drivers, brokers, and clients",
          "Coordinated schedules, route changes, and operational updates to ensure smooth delivery execution",
          "Identified issues early, recorded key details, and resolved problems under pressure (delays, breakdowns, route changes)",
          "Maintained compliance-related documents including delivery notes, manifests, and supporting paperwork",
          "Communicated clearly with stakeholders to resolve disruptions and deliver solutions"
        ]
      }
    ],
    education: "Bachelor of Science: Computer Engineering — Vistula University, Warsaw, Poland",
    hobbies: [
      "Fitness & strength training (consistent gym routine)",
      "Music (Spotify, playlists, live events)",
      "Student Housing Assistance — Helping international students secure accommodation through agency and landlord connections"
    ]
  }
};

// Autofill field values
export const AUTOFILL_DATA = {
  firstName: "Carlton",
  lastName: "Dzingira",
  fullName: "Carlton Dzingira",
  email: "fredrickcarlton@gmail.com",
  phone: "+48577327906",
  phoneAlternate: "48577327906",
  city: "Warsaw",
  country: "Poland",
  countryCode: "PL",
  location: "Warsaw, Poland",
  address: "Warsaw, Poland",
  currentJobTitle: "Operations Expert",
  currentCompany: "Teleperformance",
  yearsExperience: "4",
  workAuthorisation: "Yes",
  rightToWork: "Yes",
  requireSponsorship: "No",
  remotePreference: "Remote",
  willingToRelocate: "No",
  englishProficiency: "C1 / Advanced",
  linkedin: "",
  portfolio: "",
  website: "",
  salary: "", // leave blank unless required
  noticePeriod: "2 weeks",
  availability: "2 weeks notice",
  gender: "",
  nationality: "Zimbabwean",
  educationLevel: "Bachelor's Degree (In Progress)",
  university: "Vistula University",
  degree: "Bachelor of Science in Computer Engineering",
  graduationYear: "2026"
};
