export const GRADE_LEVELS = [
  "ม.1",
  "ม.2",
  "ม.3",
  "ม.4",
  "ม.5",
  "ม.6",
] as const;

export type GradeLevel = (typeof GRADE_LEVELS)[number];

export const CLASS_ROOMS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
] as const;

export type ClassRoom = (typeof CLASS_ROOMS)[number];

const GRADE_LEVEL_SET = new Set<string>(GRADE_LEVELS);
const CLASS_ROOM_SET = new Set<string>(CLASS_ROOMS);

export function isGradeLevel(value: unknown): value is GradeLevel {
  return typeof value === "string" && GRADE_LEVEL_SET.has(value.trim());
}

export function isClassRoom(value: unknown): value is ClassRoom {
  return typeof value === "string" && CLASS_ROOM_SET.has(value.trim());
}

export function formatClassroom(
  gradeLevel: string | null | undefined,
  room: string | null | undefined,
): string | null {
  const g = gradeLevel?.trim() ?? "";
  const r = room?.trim() ?? "";
  if (g && r) {
    return `${g}/${r}`;
  }
  if (g) {
    return g;
  }
  return null;
}

export interface ParsedClassroom {
  gradeLevel: GradeLevel | "";
  room: ClassRoom | "";
  customGrade: string;
}

export function parseClassroom(
  grade: string | null | undefined,
): ParsedClassroom {
  const raw = grade?.trim() ?? "";
  if (!raw) {
    return { gradeLevel: "", room: "", customGrade: "" };
  }

  // Matches e.g. "ม.5/14", "ม. 5 / 14", "ม.5 ห้อง 14", or "ม.5"
  const match = /^ม\.\s*([1-6])(?:\s*(?:\/|ห้อง)\s*(\d{1,2}))?$/.exec(raw);
  if (match) {
    const levelCandidate = `ม.${match[1]}`;
    const roomCandidate = match[2] ?? "";
    if (isGradeLevel(levelCandidate)) {
      if (!roomCandidate) {
        return { gradeLevel: levelCandidate, room: "", customGrade: "" };
      }
      const normalizedRoom = String(Number(roomCandidate));
      if (isClassRoom(normalizedRoom)) {
        return {
          gradeLevel: levelCandidate,
          room: normalizedRoom,
          customGrade: "",
        };
      }
    }
  }

  return { gradeLevel: "", room: "", customGrade: raw };
}

export function splitFullName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return { firstName: "", lastName: "" };
  }
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) {
    return { firstName: trimmed, lastName: "" };
  }
  return {
    firstName: trimmed.slice(0, spaceIndex).trim(),
    lastName: trimmed.slice(spaceIndex + 1).trim(),
  };
}

export function joinFullName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}
