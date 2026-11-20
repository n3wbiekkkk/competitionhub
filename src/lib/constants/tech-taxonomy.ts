import { z } from "zod";

/**
 * Fixed 8 Computer & Technology competition categories.
 * Must stay identical character-for-character with db/schema.sql CHECK constraint.
 */
export const TECH_CATEGORIES = [
  "Programming / Competitive",
  "AI & Data Science",
  "Web & Mobile Dev",
  "Cybersecurity / CTF",
  "Robotics & IoT",
  "Game Dev",
  "Tech Hackathon & Innovation",
  "UI/UX & Digital Design",
] as const;

export type TechCategory = (typeof TECH_CATEGORIES)[number];

export type TechCategoryIconName =
  | "Terminal"
  | "BrainCircuit"
  | "Globe"
  | "ShieldAlert"
  | "Cpu"
  | "Gamepad2"
  | "Rocket"
  | "Palette";

export interface TechCategoryMeta {
  value: TechCategory;
  labelTh: string;
  shortLabel: string;
  descriptionTh: string;
  iconName: TechCategoryIconName;
  badgeClassName: string;
}

const CATEGORY_BADGES = {
  sky: "border-sky-foreground/15 bg-sky text-sky-foreground",
  sage: "border-sage-foreground/15 bg-sage text-sage-foreground",
  lavender: "border-lavender-foreground/15 bg-lavender text-lavender-foreground",
  peach: "border-peach-foreground/15 bg-peach text-peach-foreground",
} as const;

export const TECH_CATEGORY_META: Record<TechCategory, TechCategoryMeta> = {
  "Programming / Competitive": {
    value: "Programming / Competitive",
    labelTh: "อัลกอริทึม / เขียนโปรแกรมแข่งขัน",
    shortLabel: "Competitive / Algo",
    descriptionTh:
      "การแข่งขันเขียนโปรแกรม อัลกอริทึม โครงสร้างข้อมูล และโจทย์คณิตศาสตร์เชิงคอมพิวเตอร์ เช่น TOI, POSN, ICPC Thailand",
    iconName: "Terminal",
    badgeClassName: CATEGORY_BADGES.sky,
  },
  "AI & Data Science": {
    value: "AI & Data Science",
    labelTh: "ปัญญาประดิษฐ์ / ML / Data",
    shortLabel: "AI & Data",
    descriptionTh:
      "Machine Learning, Deep Learning, LLM/GenAI, Computer Vision, NLP และวิทยาการข้อมูล",
    iconName: "BrainCircuit",
    badgeClassName: CATEGORY_BADGES.lavender,
  },
  "Web & Mobile Dev": {
    value: "Web & Mobile Dev",
    labelTh: "พัฒนาเว็บ / แอปพลิเคชัน",
    shortLabel: "Web & Mobile",
    descriptionTh:
      "การพัฒนาซอฟต์แวร์ เว็บแอป แอปมือถือ API และวิศวกรรมซอฟต์แวร์ เช่น NSC, Young Webmaster Camp",
    iconName: "Globe",
    badgeClassName: CATEGORY_BADGES.sky,
  },
  "Cybersecurity / CTF": {
    value: "Cybersecurity / CTF",
    labelTh: "ความมั่นคงปลอดภัยไซเบอร์ / CTF",
    shortLabel: "Cyber / CTF",
    descriptionTh:
      "Capture The Flag, Web/Binary Exploitation, Reverse Engineering, Forensics และความปลอดภัยเครือข่าย",
    iconName: "ShieldAlert",
    badgeClassName: CATEGORY_BADGES.peach,
  },
  "Robotics & IoT": {
    value: "Robotics & IoT",
    labelTh: "หุ่นยนต์ / สมองกลฝังตัว / IoT",
    shortLabel: "Robotics & IoT",
    descriptionTh:
      "หุ่นยนต์อัตโนมัติ Embedded Systems, Microcontroller (Arduino/ESP32), ROS, Drone และอุปกรณ์ IoT",
    iconName: "Cpu",
    badgeClassName: CATEGORY_BADGES.sage,
  },
  "Game Dev": {
    value: "Game Dev",
    labelTh: "พัฒนาเกม / Game Jam",
    shortLabel: "Game Dev",
    descriptionTh:
      "การสร้างเกม 2D/3D Game Jam เกมเพื่อการศึกษา Interactive Simulation ด้วย Unity, Godot หรือ Unreal",
    iconName: "Gamepad2",
    badgeClassName: CATEGORY_BADGES.lavender,
  },
  "Tech Hackathon & Innovation": {
    value: "Tech Hackathon & Innovation",
    labelTh: "แฮกกาธอน / นวัตกรรมดิจิทัล",
    shortLabel: "Tech Hackathon",
    descriptionTh:
      "Tech Hackathon, Tech Startup Pitching และโครงงานนวัตกรรมที่ใช้ซอฟต์แวร์หรือเทคโนโลยีดิจิทัลแก้ปัญหา",
    iconName: "Rocket",
    badgeClassName: CATEGORY_BADGES.sage,
  },
  "UI/UX & Digital Design": {
    value: "UI/UX & Digital Design",
    labelTh: "ออกแบบผลิตภัณฑ์ดิจิทัล / UX/UI",
    shortLabel: "UI/UX Design",
    descriptionTh:
      "ออกแบบประสบการณ์ผู้ใช้ (UX) ส่วนติดต่อผู้ใช้ (UI) Design System และ Interactive Prototype สำหรับผลิตภัณฑ์ดิจิทัล",
    iconName: "Palette",
    badgeClassName: CATEGORY_BADGES.peach,
  },
};

/**
 * Fixed 13 preset tech team roles used for recommended_roles, preferred_role, and assigned_role.
 */
export const TECH_ROLES = [
  "Frontend",
  "Backend",
  "Full-Stack",
  "Mobile Dev",
  "AI / ML",
  "Data Science",
  "Cybersecurity",
  "Embedded / IoT",
  "Robotics",
  "Game Dev",
  "UI/UX Design",
  "Algorithm / CP",
  "Pitching & PM",
] as const;

export type TechRole = (typeof TECH_ROLES)[number];

export interface TechRoleMeta {
  label: TechRole;
  labelTh: string;
}

export const TECH_ROLE_META: Record<TechRole, TechRoleMeta> = {
  Frontend: { label: "Frontend", labelTh: "พัฒนาส่วนหน้าเว็บ (Frontend)" },
  Backend: { label: "Backend", labelTh: "พัฒนาระบบหลังบ้านและ API" },
  "Full-Stack": { label: "Full-Stack", labelTh: "พัฒนาเว็บครบวงจร (Full-Stack)" },
  "Mobile Dev": { label: "Mobile Dev", labelTh: "พัฒนาแอปพลิเคชันมือถือ" },
  "AI / ML": { label: "AI / ML", labelTh: "ปัญญาประดิษฐ์และโมเดล ML" },
  "Data Science": { label: "Data Science", labelTh: "วิเคราะห์ข้อมูลและ Data Pipeline" },
  Cybersecurity: { label: "Cybersecurity", labelTh: "ความปลอดภัยไซเบอร์ / CTF" },
  "Embedded / IoT": { label: "Embedded / IoT", labelTh: "สมองกลฝังตัวและ IoT" },
  Robotics: { label: "Robotics", labelTh: "วิศวกรรมหุ่นยนต์และระบบควบคุม" },
  "Game Dev": { label: "Game Dev", labelTh: "พัฒนาเกมและเอนจินเกม" },
  "UI/UX Design": { label: "UI/UX Design", labelTh: "ออกแบบ UI/UX และต้นแบบ" },
  "Algorithm / CP": { label: "Algorithm / CP", labelTh: "อัลกอริทึมและโจทย์แข่งขัน" },
  "Pitching & PM": { label: "Pitching & PM", labelTh: "บริหารทีมและนำเสนอผลงาน" },
};

/**
 * Fixed 16 preset tech skill tags for Student Profiles.
 */
export const TECH_SKILLS = [
  "Python",
  "C/C++",
  "JavaScript",
  "TypeScript",
  "React / Next.js",
  "Node.js",
  "Flutter",
  "SQL",
  "PyTorch / TensorFlow",
  "Linux / Networking",
  "Arduino / ESP32",
  "ROS",
  "Unity / Godot",
  "Figma",
  "Git",
  "Docker",
] as const;

export type TechSkill = (typeof TECH_SKILLS)[number];

export interface TechSkillGroup {
  id: string;
  labelTh: string;
  skills: readonly TechSkill[];
}

export const TECH_SKILL_GROUPS: readonly TechSkillGroup[] = [
  {
    id: "languages",
    labelTh: "ภาษาโปรแกรมหลัก",
    skills: ["Python", "C/C++", "JavaScript", "TypeScript"],
  },
  {
    id: "web-mobile",
    labelTh: "พัฒนาเว็บ แอป และฐานข้อมูล",
    skills: ["React / Next.js", "Node.js", "Flutter", "SQL"],
  },
  {
    id: "ai-infra",
    labelTh: "AI และระบบเครือข่าย",
    skills: ["PyTorch / TensorFlow", "Linux / Networking"],
  },
  {
    id: "hardware",
    labelTh: "หุ่นยนต์และสมองกลฝังตัว",
    skills: ["Arduino / ESP32", "ROS"],
  },
  {
    id: "game-design-tools",
    labelTh: "เกม ดีไซน์ และเครื่องมือ DevOps",
    skills: ["Unity / Godot", "Figma", "Git", "Docker"],
  },
];

export const USER_ROLES = ["student", "teacher"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS_TH: Record<UserRole, string> = {
  student: "นักเรียน / นิสิต",
  teacher: "ผู้ดูแลระบบ (Admin)",
};

export const COMPETITION_STATUSES = [
  "pending_review",
  "open",
  "closed",
  "rejected",
] as const;
export type CompetitionStatus = (typeof COMPETITION_STATUSES)[number];

export interface CompetitionStatusMeta {
  value: CompetitionStatus;
  labelTh: string;
  badgeClassName: string;
}

export const COMPETITION_STATUS_META: Record<
  CompetitionStatus,
  CompetitionStatusMeta
> = {
  pending_review: {
    value: "pending_review",
    labelTh: "รออาจารย์ตรวจสอบ",
    badgeClassName:
      "bg-neutral-100 text-neutral-700 border-neutral-300 dark:bg-neutral-900 dark:text-neutral-300 dark:border-neutral-700",
  },
  open: {
    value: "open",
    labelTh: "กำลังเปิดรับสมัคร",
    badgeClassName:
      "bg-primary/8 text-primary border-primary/25 dark:bg-primary/15",
  },
  closed: {
    value: "closed",
    labelTh: "ปิดรับแล้ว",
    badgeClassName:
      "bg-neutral-100 text-neutral-500 border-neutral-200 dark:bg-neutral-900 dark:text-neutral-400 dark:border-neutral-800",
  },
  rejected: {
    value: "rejected",
    labelTh: "ไม่ผ่านการอนุมัติ",
    badgeClassName:
      "bg-neutral-100 text-destructive border-destructive/25 dark:bg-neutral-900",
  },
};

export const COMPETITION_SOURCE_TYPES = [
  "ai_auto",
  "ai_link",
  "ai_poster",
  "manual",
] as const;
export type CompetitionSourceType = (typeof COMPETITION_SOURCE_TYPES)[number];

export const COMPETITION_SOURCE_LABELS_TH: Record<
  CompetitionSourceType,
  string
> = {
  ai_auto: "AI หาให้อัตโนมัติ",
  ai_link: "นักเรียนส่งลิงก์",
  ai_poster: "นักเรียนอัปโปสเตอร์",
  manual: "อาจารย์เพิ่มเอง",
};

export function getCompetitionSourceLabel(
  sourceType: CompetitionSourceType,
  submitterRole?: UserRole | null,
): string {
  switch (sourceType) {
    case "ai_auto":
      return "AI หาให้อัตโนมัติ";
    case "ai_link":
      return submitterRole === "teacher"
        ? "สกัดจากลิงก์/ข้อความ (AI)"
        : "นักเรียนส่งลิงก์";
    case "ai_poster":
      return submitterRole === "teacher"
        ? "สกัดจากโปสเตอร์ (AI)"
        : "นักเรียนอัปโปสเตอร์";
    case "manual":
      return "เพิ่มโดยอาจารย์";
  }
}

export const TEAM_STATUSES = ["draft", "confirmed"] as const;
export type TeamStatus = (typeof TEAM_STATUSES)[number];

export const TEAM_STATUS_LABELS_TH: Record<TeamStatus, string> = {
  draft: "แบบร่าง (รอจัดทีม)",
  confirmed: "ยืนยันทีมแล้ว",
};

export const STUDENT_TEAM_PROGRESS_LABELS_TH = {
  waiting: "รอจัดกลุ่ม",
  assigned: "ได้ทีมแล้ว",
} as const;

/**
 * Zod schemas for strict boundary validation.
 */
export const techCategorySchema = z.enum(TECH_CATEGORIES);
export const techRoleSchema = z.enum(TECH_ROLES);
export const techSkillSchema = z.enum(TECH_SKILLS);
export const userRoleSchema = z.enum(USER_ROLES);
export const competitionStatusSchema = z.enum(COMPETITION_STATUSES);
export const competitionSourceTypeSchema = z.enum(COMPETITION_SOURCE_TYPES);
export const teamStatusSchema = z.enum(TEAM_STATUSES);

const TECH_CATEGORY_SET = new Set<string>(TECH_CATEGORIES);
const TECH_ROLE_SET = new Set<string>(TECH_ROLES);
const USER_ROLE_SET = new Set<string>(USER_ROLES);
const COMPETITION_STATUS_SET = new Set<string>(COMPETITION_STATUSES);
const COMPETITION_SOURCE_TYPE_SET = new Set<string>(COMPETITION_SOURCE_TYPES);
const TEAM_STATUS_SET = new Set<string>(TEAM_STATUSES);

export function isTechCategory(value: unknown): value is TechCategory {
  return typeof value === "string" && TECH_CATEGORY_SET.has(value);
}

export function isTechRole(value: unknown): value is TechRole {
  return typeof value === "string" && TECH_ROLE_SET.has(value);
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && USER_ROLE_SET.has(value);
}

export function isCompetitionStatus(
  value: unknown,
): value is CompetitionStatus {
  return typeof value === "string" && COMPETITION_STATUS_SET.has(value);
}

export function isCompetitionSourceType(
  value: unknown,
): value is CompetitionSourceType {
  return typeof value === "string" && COMPETITION_SOURCE_TYPE_SET.has(value);
}

export function isTeamStatus(value: unknown): value is TeamStatus {
  return typeof value === "string" && TEAM_STATUS_SET.has(value);
}
