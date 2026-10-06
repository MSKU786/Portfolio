export const personal = {
  name: "Manish Singh",
  role: "Senior Software Engineer",
  location: "Bengaluru, Karnataka, IN",
  email: "manishsingh332000@gmail.com",
  summary:
    "Senior Software Engineer specializing in Node.js/TypeScript backend systems and AI-native product development — building RAG pipelines, vector search, and LLM integrations (Vertex AI, OpenAI, MCP) alongside event-driven architecture, with a demonstrated history of leading cross-functional teams and shipping production integrations for enterprise financial clients.",
  social: {
    github: "https://github.com/MSKU786",
    linkedin: "https://linkedin.com/in/manish-singh-266b25150",
    leetcode: "https://leetcode.com/CreatorLeo",
    email: "mailto:manishsingh332000@gmail.com",
  },
  resumeUrl: "/resume.pdf",
};

export const stats = [
  { value: "5+", label: "Years of experience" },
  { value: "70%", label: "Issues auto-triaged by an RCA agent" },
  { value: "20+", label: "Client upgrade deployments led" },
  { value: "4+3", label: "Engineers & QA mentored" },
];

/** What I'm focused on right now — surfaced in the About section. */
export const now = {
  focus:
    "LLM evaluation pipelines, multi-agent RCA workflows, and semantic search at Interface AI.",
  learning:
    "Distributed systems internals — rebuilding Redis from scratch in Go.",
};

/** The handful of tools I reach for daily. A condensed view of `skills`. */
export const coreStack = [
  "TypeScript",
  "Node.js",
  "Python",
  "PostgreSQL",
  "Pinecone",
  "AWS",
  "Kubernetes",
  "Vertex AI",
];

export type Experience = {
  company: string;
  companyUrl?: string;
  location: string;
  role: string;
  period: string;
  skills: string[];
  highlights: string[];
};

export const experience: Experience[] = [
  {
    company: "Interface AI",
    location: "Bengaluru, IN",
    role: "Senior Software Engineer",
    period: "Apr 2023 – Present",
    skills: ["Node.js", "Python", "AWS", "Kubernetes", "Vertex AI", "Langfuse", "PostgreSQL"],
    highlights: [
      "Built an end-to-end LLM evaluation pipeline processing 50K+ production traces per day from Langfuse, using GPT-4.1 mini to classify unanswered queries into a self-evolving topic/subtopic taxonomy per tenant.",
      "Designed a trend-resolution job that tracks each category's 14-day success rate, automatically marking knowledge gaps as resolved and flagging regressions.",
      "Surfaced results in a tenant-scoped customer dashboard showing which common queries the assistant cannot answer, so customers know which data sources to add.",
      "Designed a multi-agent RCA agentic workflow (via MCP + Jira integration) that classifies issues and identifies root cause using structured LLM outputs, eliminating manual investigation for 70% of reported issues.",
      "Developed the trace-resolver cron job to retroactively update query traces when tenants add training data; introduced a date-scoped UI filter (default: last 2 weeks) to remove stale low-confidence suggestions.",
      "Upgraded Smart Discovery to v5 — built a semantic search pipeline generating embeddings from crawled site content and indexing them in Pinecone; migrated ~90% of customers to v5.",
      "Delivered a RAG-based Gen AI site search feature, orchestrating the Frontline Server and Vertex AI for embedding-based retrieval and content recommendations; adopted by 80% of clients.",
      "Led a team of 4 engineers and 3 QA, mentored team members on architecture and delivery standards, coordinated 20+ client upgrade deployments, and resolved customer CRs across the full release lifecycle.",
      "Implemented silent authentication for the OLB page with secure, encrypted data exchange; shipped Smart Conversion on Glia via a shared cache layer supporting cross-channel interactions live across 8+ clients.",
    ],
  },
  {
    company: "Interface AI",
    location: "Bengaluru, IN",
    role: "Software Development Engineer",
    period: "May 2022 – Mar 2023",
    skills: ["Node.js", "React", "PostgreSQL", "Docker", "AWS", "Jenkins"],
    highlights: [
      "Integrated FISERV core banking APIs with supporting backend modules for data consistency and auth workflows; onboarded 13+ live clients with 5+ recent go-lives.",
      "Identified and refactored sequential REST API calls to run concurrently using Promise.all(), cutting response time from 30–40s to under 10s for 50+ enterprise clients.",
      "Engineered token-authenticated conversation APIs secured via IP whitelisting with AWS Lambda integration, serving 15+ clients; added Smart Transaction support (balance checks, transfers) used by ~70% of chatbot clients.",
      "Integrated HealthCore APIs across multiple core systems for uptime monitoring and alerting, improving observability for ~95% of production clients; managed deployments via Jenkins CI/CD pipelines.",
    ],
  },
  {
    company: "Twurs",
    location: "Bengaluru, IN",
    role: "Full Stack Developer",
    period: "Aug 2021 – Apr 2022",
    skills: ["React.js", "Next.js", "GraphQL", "Firebase", "TailwindCSS"],
    highlights: [
      "Built and maintained the GraphQL API behind the booking product — schema, resolvers, and data access over Firebase — serving the Next.js front end.",
      "Replaced per-day availability lookups with a single aggregated monthly GraphQL query, returning a full month of seat availability in one request instead of one call per date; cut API load and improved load time by 60%, lifting user engagement by 30%.",
      "Shipped new customer-facing pages and a set of reusable React components in Next.js and TailwindCSS.",
      "Improved front-end page speed and API response latency across the product, profiling slow pages and cutting request overhead on the API.",
    ],
  },
];

export type Project = {
  name: string;
  description: string;
  tags: string[];
  url?: string;
  period?: string;
};

export const projects: Project[] = [
  {
    name: "Ticketing",
    description:
      "Event-driven microservices system with NATS Streaming pub-sub, typed events, and durable queues; published reusable NPM packages for shared utilities across services.",
    tags: ["Node.js", "Next.js", "NATS Streaming", "MongoDB", "Kubernetes", "GCP", "TypeScript"],
    period: "Apr 2024 – Present",
  },
  {
    name: "My_Redis",
    description: "A from-scratch reimplementation of Redis to understand in-memory data stores, persistence, and the wire protocol.",
    tags: ["Go"],
    url: "https://github.com/MSKU786/My_Redis",
  },
  {
    name: "Notification_Service",
    description: "A multi-channel notification service that sends messages through Email, SMS, Slack, WhatsApp, and more from a single unified API.",
    tags: ["Node.js", "System Design"],
    url: "https://github.com/MSKU786/Notification_Service",
  },
  {
    name: "Incident_Management_System",
    description: "An incident tracking and management system covering intake, triage, and resolution workflows.",
    tags: ["JavaScript"],
    url: "https://github.com/MSKU786/Incident_Management_System",
  },
];

export const skills: { category: string; items: string[] }[] = [
  {
    category: "Languages & Databases",
    items: ["JavaScript", "TypeScript", "Python", "Java", "SQL", "PostgreSQL", "MongoDB", "Redis", "Pinecone"],
  },
  {
    category: "Frameworks & Libraries",
    items: ["Node.js", "Express", "Koa", "React", "Next.js", "TailwindCSS", "Electron"],
  },
  {
    category: "AI/LLM Engineering",
    items: ["RAG Pipelines", "Vector Search", "Prompt Engineering", "Vertex AI", "OpenAI", "MCP", "Agentic Workflows"],
  },
  {
    category: "Cloud, DevOps & Testing",
    items: ["AWS", "Kubernetes", "Docker", "Jenkins", "WAF", "CI/CD", "Jest", "Mocha"],
  },
  {
    category: "Development Skills",
    items: ["Microservices", "Event-Driven Architecture", "REST & GraphQL APIs", "Async Programming", "System Design"],
  },
  {
    category: "Tools",
    items: ["Git", "Bitbucket", "Jira", "Kibana", "VS Code", "Cursor"],
  },
];

export const education = {
  school: "B.T.K.I.T Dwarahat",
  location: "Dwarahat, Uttarakhand",
  degree: "Bachelor of Technology, Computer Science & Engineering",
  detail: "CGPA: 8.6/10",
  period: "Jul 2016 – Jul 2020",
};
