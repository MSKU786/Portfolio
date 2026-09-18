import {
  education,
  experience,
  personal,
  projects,
  skills,
  stats,
} from "@/data/resume";

/**
 * A retrievable unit of knowledge about Manish.
 *
 * `anchor` points at the section on the page that the chunk came from, so the
 * UI can scroll to — and highlight — the source of any cited answer.
 */
export type Chunk = {
  id: string;
  /** Breadcrumb shown on the source chip, e.g. "Experience › Interface AI". */
  label: string;
  /** The text handed to the model. */
  text: string;
  /** Page section id (`#about`, `#experience`, …). */
  anchor: string;
};

function bulletId(prefix: string, index: number) {
  return `${prefix}-${index}`;
}

/**
 * Condenses a bullet down to its opening clause, so every source chip in the
 * chat names what it actually covers instead of repeating the company.
 */
function topic(text: string, maxChars = 34): string {
  const clause = text.split(/[;,—(]/)[0]!.trim();
  if (clause.length <= maxChars) return clause;

  const cut = clause.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 12 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Flattens the resume into chunks. Each chunk is small enough to be cited
 * precisely but carries enough surrounding context (company, role, period) to
 * stand on its own when the model reads it out of order.
 */
function buildChunks(): Chunk[] {
  const chunks: Chunk[] = [];

  chunks.push({
    id: "profile",
    label: "Profile",
    anchor: "about",
    text: [
      `${personal.name} is a ${personal.role} based in ${personal.location}.`,
      `Contact email: ${personal.email}.`,
      `GitHub: ${personal.social.github}. LinkedIn: ${personal.social.linkedin}. LeetCode: ${personal.social.leetcode}.`,
      personal.summary,
    ].join(" "),
  });

  chunks.push({
    id: "stats",
    label: "Profile › At a glance",
    anchor: "about",
    text: `Key numbers: ${stats
      .map((stat) => `${stat.value} — ${stat.label}`)
      .join("; ")}.`,
  });

  experience.forEach((job, jobIndex) => {
    const context = `${job.role} at ${job.company} (${job.period}, ${job.location})`;

    chunks.push({
      id: bulletId(`exp-${jobIndex}`, 0),
      label: `${job.company} › ${job.role}`,
      anchor: "experience",
      text: `${context}. Technologies used in this role: ${job.skills.join(", ")}.`,
    });

    job.highlights.forEach((highlight, index) => {
      chunks.push({
        id: bulletId(`exp-${jobIndex}-h`, index),
        label: `${job.company} › ${topic(highlight)}`,
        anchor: "experience",
        text: `${context}: ${highlight}`,
      });
    });
  });

  projects.forEach((project, index) => {
    chunks.push({
      id: bulletId("project", index),
      label: `Projects › ${project.name}`,
      anchor: "projects",
      text: [
        `Personal project "${project.name}"${project.period ? ` (${project.period})` : ""}.`,
        project.description,
        `Built with: ${project.tags.join(", ")}.`,
        project.url ? `Source: ${project.url}` : "",
      ]
        .filter(Boolean)
        .join(" "),
    });
  });

  skills.forEach((group, index) => {
    chunks.push({
      id: bulletId("skills", index),
      label: `Skills › ${group.category}`,
      anchor: "skills",
      text: `${group.category}: ${group.items.join(", ")}.`,
    });
  });

  chunks.push({
    id: "education",
    label: "Education",
    anchor: "education",
    text: `${education.degree} from ${education.school}, ${education.location} (${education.period}). ${education.detail}.`,
  });

  return chunks;
}

/** Built once per server process — the resume is static at runtime. */
export const CHUNKS: Chunk[] = buildChunks();
