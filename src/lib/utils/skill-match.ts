export type SkillMatchField =
  | "tech_stack_hint"
  | "recommended_role"
  | "title"
  | "summary";

export interface SkillMatchEvidence {
  field: SkillMatchField;
  value: string;
}

export interface MatchedSkill {
  skill: string;
  matchedAs: string[];
  evidence: SkillMatchEvidence[];
}

export interface RoleMatch {
  role: string;
  skills: string[];
}

export interface SkillMatchExplanation {
  score: number;
  matchedSkills: MatchedSkill[];
  missingSkills: string[];
  roleMatches: RoleMatch[];
}

export interface SkillMatchCompetition {
  readonly title?: string | null;
  readonly summary?: string | null;
  readonly recommended_roles?: readonly string[] | null;
  readonly tech_stack_hints?: readonly string[] | null;
}

export interface ExplainSkillMatchInput {
  readonly userSkills: readonly string[];
  readonly competition: SkillMatchCompetition;
}

const SKILL_PHRASE_ALIASES: Readonly<Record<string, string>> = {
  "next js": "nextjs",
  "node js": "nodejs",
  "data science": "datascience",
  "machine learning": "aiml",
  "deep learning": "aiml",
  "front end": "frontend",
  "back end": "backend",
  "full stack": "fullstack",
};

const SKILL_TOKEN_ALIASES: Readonly<Record<string, string>> = {
  react: "react",
  reactjs: "react",
  next: "nextjs",
  nextjs: "nextjs",
  node: "nodejs",
  nodejs: "nodejs",
  js: "javascript",
  javascript: "javascript",
  ts: "typescript",
  typescript: "typescript",
  py: "python",
  python: "python",
  c: "c",
  "c++": "cpp",
  cpp: "cpp",
  pytorch: "pytorch",
  torch: "pytorch",
  tensorflow: "tensorflow",
  tf: "tensorflow",
  arduino: "arduino",
  esp32: "esp32",
  linux: "linux",
  network: "networking",
  networking: "networking",
  ros: "ros",
  unity: "unity",
  unity3d: "unity",
  godot: "godot",
  figma: "figma",
  git: "git",
  github: "git",
  gitlab: "git",
  docker: "docker",
  container: "docker",
  flutter: "flutter",
  dart: "flutter",
  sql: "sql",
  mysql: "sql",
  postgres: "sql",
  postgresql: "sql",
  sqlite: "sql",
  html: "html",
  css: "css",
  tailwind: "tailwind",
  graphql: "graphql",
  rest: "rest",
  api: "api",
  go: "go",
  r: "r",
  ai: "aiml",
  aiml: "aiml",
  ml: "aiml",
  machine: "aiml",
  learning: "aiml",
  robot: "robotics",
  robotics: "robotics",
  cyber: "cybersecurity",
  cybersecurity: "cybersecurity",
  ctf: "cybersecurity",
  security: "cybersecurity",
  embedded: "embedded",
  iot: "embedded",
  game: "gamedev",
  gamedev: "gamedev",
  ui: "uxdesign",
  ux: "uxdesign",
  design: "uxdesign",
  designer: "uxdesign",
  algorithm: "algorithm",
  algo: "algorithm",
  cp: "algorithm",
  pitch: "pitching",
  pitching: "pitching",
  pm: "pitching",
};

const ROLE_PHRASE_ALIASES: Readonly<Record<string, string>> = {
  "front end": "frontend",
  "back end": "backend",
  "full stack": "fullstack",
  "mobile dev": "mobile",
  "mobile developer": "mobile",
  "ai ml": "aiml",
  "data science": "datascience",
  "cybersecurity ctf": "cybersecurity",
  "embedded iot": "embedded",
  "game dev": "gamedev",
  "ui ux": "uxdesign",
  "ui ux design": "uxdesign",
  "algorithm cp": "algorithm",
  "pitching pm": "pitching",
};

const ROLE_TOKEN_ALIASES: Readonly<Record<string, string>> = {
  frontend: "frontend",
  front: "frontend",
  backend: "backend",
  back: "backend",
  fullstack: "fullstack",
  full: "fullstack",
  mobile: "mobile",
  ai: "aiml",
  aiml: "aiml",
  ml: "aiml",
  datascience: "datascience",
  cybersecurity: "cybersecurity",
  cyber: "cybersecurity",
  ctf: "cybersecurity",
  security: "cybersecurity",
  embedded: "embedded",
  iot: "embedded",
  robotics: "robotics",
  robot: "robotics",
  ui: "uxdesign",
  ux: "uxdesign",
  design: "uxdesign",
  designer: "uxdesign",
  algorithm: "algorithm",
  algo: "algorithm",
  cp: "algorithm",
  pitch: "pitching",
  pitching: "pitching",
  pm: "pitching",
};

const SKILL_ROLE_HINTS: Readonly<Record<string, readonly string[]>> = {
  react: ["frontend", "fullstack"],
  nextjs: ["frontend", "fullstack"],
  javascript: ["frontend", "backend", "fullstack"],
  typescript: ["frontend", "backend", "fullstack"],
  nodejs: ["backend", "fullstack"],
  python: ["aiml", "datascience"],
  pytorch: ["aiml"],
  tensorflow: ["aiml"],
  aiml: ["aiml"],
  datascience: ["datascience"],
  sql: ["backend", "datascience"],
  c: ["algorithm"],
  cpp: ["algorithm", "embedded"],
  arduino: ["embedded", "robotics"],
  esp32: ["embedded", "robotics"],
  ros: ["embedded", "robotics"],
  unity: ["gamedev"],
  godot: ["gamedev"],
  figma: ["uxdesign"],
  flutter: ["mobile"],
  git: ["fullstack"],
  docker: ["fullstack", "backend"],
  linux: ["embedded"],
  networking: ["embedded"],
};

const CONCEPT_LABELS: Readonly<Record<string, string>> = {
  react: "React",
  nextjs: "Next.js",
  nodejs: "Node.js",
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  c: "C",
  cpp: "C++",
  pytorch: "PyTorch",
  tensorflow: "TensorFlow",
  arduino: "Arduino",
  esp32: "ESP32",
  linux: "Linux",
  networking: "Networking",
  ros: "ROS",
  unity: "Unity",
  godot: "Godot",
  figma: "Figma",
  git: "Git",
  docker: "Docker",
  flutter: "Flutter",
  sql: "SQL",
  go: "Go",
  r: "R",
  aiml: "AI / ML",
  datascience: "Data Science",
  robotics: "Robotics",
  cybersecurity: "Cybersecurity",
  embedded: "Embedded / IoT",
  gamedev: "Game Dev",
  uxdesign: "UI/UX Design",
  algorithm: "Algorithm / CP",
  pitching: "Pitching & PM",
};

const ROLE_LABELS: Readonly<Record<string, string>> = {
  frontend: "Frontend",
  backend: "Backend",
  fullstack: "Full-Stack",
  mobile: "Mobile Dev",
  aiml: "AI / ML",
  datascience: "Data Science",
  cybersecurity: "Cybersecurity",
  embedded: "Embedded / IoT",
  robotics: "Robotics",
  gamedev: "Game Dev",
  uxdesign: "UI/UX Design",
  algorithm: "Algorithm / CP",
  pitching: "Pitching & PM",
};

interface ParsedSkill {
  label: string;
  concepts: string[];
  roleKeys: string[];
  signature: string;
}

interface MatchField {
  field: SkillMatchField;
  value: string;
  concepts: string[];
  roles: string[];
}

function phraseKey(raw: string): string {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9+#ก-๙]+/g, " ")
    .trim();
}

function toConcepts(raw: string): string[] {
  const phrase = phraseKey(raw);
  if (!phrase) return [];

  const phraseConcept = SKILL_PHRASE_ALIASES[phrase];
  if (phraseConcept) return [phraseConcept];

  const concepts = new Set<string>();
  for (const token of phrase.split(" ")) {
    const concept = SKILL_TOKEN_ALIASES[token] ?? (token.length >= 2 ? token : "");
    if (concept) concepts.add(concept);
  }
  return [...concepts];
}

function toRoles(raw: string): string[] {
  const phrase = phraseKey(raw);
  if (!phrase) return [];

  const roles = new Set<string>();
  const phraseRole = ROLE_PHRASE_ALIASES[phrase];
  if (phraseRole) roles.add(phraseRole);

  for (const token of phrase.split(" ")) {
    const role = ROLE_TOKEN_ALIASES[token];
    if (role) roles.add(role);
  }
  return [...roles];
}

function skillRoleKeys(concepts: readonly string[]): string[] {
  const roles = new Set<string>();
  for (const concept of concepts) {
    for (const role of SKILL_ROLE_HINTS[concept] ?? []) roles.add(role);
  }
  return [...roles];
}

function parseSkills(userSkills: readonly string[]): ParsedSkill[] {
  const seen = new Set<string>();
  const parsed: ParsedSkill[] = [];

  for (const rawSkill of userSkills) {
    if (typeof rawSkill !== "string") continue;
    const label = rawSkill.trim();
    if (!label) continue;

    const concepts = toConcepts(label);
    if (concepts.length === 0) continue;

    const signature = [...concepts].sort().join("\u0000");
    if (seen.has(signature)) continue;
    seen.add(signature);

    parsed.push({
      label,
      concepts,
      roleKeys: skillRoleKeys(concepts),
      signature,
    });
  }
  return parsed;
}

function collectFields(competition: SkillMatchCompetition): MatchField[] {
  const fields: MatchField[] = [];
  const seen = new Set<string>();

  function add(field: SkillMatchField, raw: string | null | undefined): void {
    if (typeof raw !== "string") return;
    const value = raw.trim();
    const key = `${field}:${phraseKey(value)}`;
    if (!value || seen.has(key)) return;
    seen.add(key);
    fields.push({
      field,
      value,
      concepts: field === "recommended_role" ? [] : toConcepts(value),
      roles: field === "recommended_role" ? toRoles(value) : [],
    });
  }

  for (const hint of competition.tech_stack_hints ?? []) add("tech_stack_hint", hint);
  for (const role of competition.recommended_roles ?? []) add("recommended_role", role);
  add("title", competition.title);
  add("summary", competition.summary);
  return fields;
}

function intersect<T>(left: readonly T[], right: readonly T[]): T[] {
  const rightValues = new Set(right);
  return left.filter((value) => rightValues.has(value));
}

function labelFor(labels: Readonly<Record<string, string>>, key: string): string {
  return labels[key] ?? key;
}

export function explainSkillMatch(
  input: ExplainSkillMatchInput,
): SkillMatchExplanation {
  const fields = collectFields(input.competition);
  const skills = parseSkills(input.userSkills);
  const matchedSkills: MatchedSkill[] = [];
  const matchedSkillSet = new Set<ParsedSkill>();
  const roleMatches: RoleMatch[] = [];
  const seenRoleValues = new Set<string>();

  for (const skill of skills) {
    const evidence: SkillMatchEvidence[] = [];
    const matchedAs = new Set<string>();

    for (const field of fields) {
      if (field.field === "recommended_role") {
        const direct = intersect(skill.concepts, field.roles);
        const viaRoleHint = intersect(skill.roleKeys, field.roles);
        if (direct.length > 0 || viaRoleHint.length > 0) {
          evidence.push({ field: field.field, value: field.value });
          for (const concept of direct) matchedAs.add(labelFor(CONCEPT_LABELS, concept));
          for (const role of viaRoleHint) matchedAs.add(labelFor(ROLE_LABELS, role));
        }
        continue;
      }

      const hits = intersect(skill.concepts, field.concepts);
      if (hits.length > 0) {
        evidence.push({ field: field.field, value: field.value });
        for (const concept of hits) matchedAs.add(labelFor(CONCEPT_LABELS, concept));
      }
    }

    if (evidence.length > 0) {
      matchedSkills.push({
        skill: skill.label,
        matchedAs: [...matchedAs],
        evidence,
      });
      matchedSkillSet.add(skill);
    }
  }

  for (const field of fields) {
    if (field.field !== "recommended_role") continue;
    const roleKey = phraseKey(field.value);
    if (seenRoleValues.has(roleKey)) continue;
    seenRoleValues.add(roleKey);

    const matched = skills
      .filter(
        (skill) =>
          intersect(skill.concepts, field.roles).length > 0 ||
          intersect(skill.roleKeys, field.roles).length > 0,
      )
      .map((skill) => skill.label);
    if (matched.length > 0) roleMatches.push({ role: field.value, skills: matched });
  }

  const missingSkills = skills
    .filter((skill) => !matchedSkillSet.has(skill))
    .map((skill) => skill.label);
  const score =
    skills.length === 0 ? 0 : Math.round((matchedSkills.length / skills.length) * 100);

  return { score, matchedSkills, missingSkills, roleMatches };
}

export const matchSkills = explainSkillMatch;
