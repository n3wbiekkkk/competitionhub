"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  GitBranch,
  GripVertical,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  UserPlus,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TECH_CATEGORY_META,
  TECH_ROLES,
  TECH_SKILLS,
  type TeamStatus,
} from "@/lib/constants/tech-taxonomy";
import type {
  InterestedStudentItem,
  TeacherOption,
  TeamDetail,
  TeamMemberDetail,
} from "@/lib/db/team-builder";
import { optimizeTeams, scoreTeam } from "@/lib/utils/team-optimizer";
import type { Competition } from "@/types/database";

interface TeamBuilderBoardProps {
  competition: Competition;
  interestedStudents: InterestedStudentItem[];
  initialTeams: TeamDetail[];
  teachers: TeacherOption[];
  currentTeacherId: string;
}

interface EditableTeam {
  clientId: string;
  id?: string;
  name: string;
  advisor_id: string | null;
  status: TeamStatus;
  members: TeamMemberDetail[];
}

function toEditableTeams(teams: TeamDetail[]): EditableTeam[] {
  return teams.map((team) => ({
    clientId: team.id,
    id: team.id,
    name: team.name,
    advisor_id: team.advisor_id,
    status: team.status,
    members: team.members.map((member) => ({
      ...member,
      skills: [...member.skills],
    })),
  }));
}

function toMemberDetail(student: InterestedStudentItem): TeamMemberDetail {
  return {
    user_id: student.user_id,
    assigned_role: student.preferred_role,
    full_name: student.full_name,
    nickname: student.nickname,
    email: student.email,
    grade: student.grade,
    skills: [...student.skills],
    contact: student.contact,
    github_url: student.github_url,
    portfolio_url: student.portfolio_url,
  };
}

function DraggableStudentCard({
  student,
  teams,
  onAssign,
}: {
  student: InterestedStudentItem;
  teams: EditableTeam[];
  onAssign: (student: InterestedStudentItem, targetClientId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `student:${student.user_id}`,
      data: { userId: student.user_id },
    });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-md border border-border bg-background p-3 transition-opacity ${
        isDragging ? "opacity-40" : "opacity-100"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <button
            type="button"
            {...listeners}
            {...attributes}
            aria-label={`ลาก ${student.full_name}`}
            className="mt-0.5 cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {student.full_name}
              {student.nickname ? ` (${student.nickname})` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              {student.grade || "ไม่ระบุชั้นปี"}
            </p>
          </div>
        </div>

        <span className="shrink-0 rounded border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground/80">
          {student.preferred_role}
        </span>
      </div>

      {student.skills.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {student.skills.slice(0, 6).map((skill) => (
            <span
              key={skill}
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
            >
              {skill}
            </span>
          ))}
          {student.skills.length > 6 ? (
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              +{student.skills.length - 6}
            </span>
          ) : null}
        </div>
      ) : null}

      {student.note ? (
        <p className="mt-2 line-clamp-2 border-l-2 border-border pl-2.5 text-xs text-muted-foreground">
          {student.note}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
        <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
          {student.github_url ? (
            <a
              href={student.github_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <GitBranch className="h-3 w-3" />
              GitHub
            </a>
          ) : null}
          {student.portfolio_url ? (
            <a
              href={student.portfolio_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Portfolio
            </a>
          ) : null}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={teams.length === 0}
              className="h-7 gap-1 rounded-md px-2 text-xs"
            >
              <UserPlus className="h-3 w-3" />
              เพิ่มเข้าทีม
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {teams.map((team) => (
              <DropdownMenuItem
                key={team.clientId}
                onClick={() => onAssign(student, team.clientId)}
                className="cursor-pointer"
              >
                {team.name} ({team.members.length} คน)
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function DroppableTeamCard({
  team,
  competition,
  teachers,
  busy,
  onUpdateName,
  onUpdateAdvisor,
  onUpdateMemberRole,
  onRemoveMember,
  onToggleStatus,
  onDeleteTeam,
}: {
  team: EditableTeam;
  competition: Competition;
  teachers: TeacherOption[];
  busy: boolean;
  onUpdateName: (clientId: string, name: string) => void;
  onUpdateAdvisor: (clientId: string, advisorId: string) => void;
  onUpdateMemberRole: (
    clientId: string,
    userId: string,
    role: string,
  ) => void;
  onRemoveMember: (clientId: string, userId: string) => void;
  onToggleStatus: (clientId: string, nextStatus: TeamStatus) => void;
  onDeleteTeam: (clientId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `team:${team.clientId}`,
    data: { teamClientId: team.clientId },
  });

  const memberCount = team.members.length;
  const sizeValid =
    memberCount >= competition.min_size && memberCount <= competition.max_size;
  const assignedRolesSet = new Set(
    team.members.map((m) => m.assigned_role.toLowerCase()),
  );

  return (
    <section
      ref={setNodeRef}
      className={`rounded-md border bg-background p-4 transition-colors ${
        isOver
          ? "border-primary bg-primary/5"
          : team.status === "confirmed"
            ? "border-primary/40"
            : "border-border"
      }`}
    >
      <div className="space-y-3 border-b border-border pb-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Input
            value={team.name}
            onChange={(e) => onUpdateName(team.clientId, e.target.value)}
            className="h-8 max-w-[220px] rounded-md font-medium"
            aria-label="ชื่อทีม"
          />

          <div className="flex items-center gap-2 text-xs">
            <span
              className={`rounded border px-2 py-0.5 font-mono tabular-nums ${
                sizeValid
                  ? "border-border bg-muted/40 text-foreground"
                  : "border-destructive/30 bg-muted/40 font-medium text-destructive"
              }`}
            >
              {memberCount}/{competition.max_size} คน
            </span>

            {team.status === "confirmed" ? (
              <span className="rounded border border-primary/30 bg-primary/8 px-2 py-0.5 font-medium text-primary">
                ยืนยันแล้ว
              </span>
            ) : (
              <span className="rounded border border-border px-2 py-0.5 text-muted-foreground">
                แบบร่าง
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Label className="shrink-0 text-xs text-muted-foreground">
            อาจารย์ที่ปรึกษา:
          </Label>
          <Select
            value={team.advisor_id ?? "none"}
            onValueChange={(value) =>
              onUpdateAdvisor(team.clientId, value === "none" ? "" : value)
            }
          >
            <SelectTrigger className="h-8 rounded-md text-xs">
              <SelectValue placeholder="เลือกอาจารย์ที่ปรึกษา" />
            </SelectTrigger>
            <SelectContent>
              {teachers.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.full_name || t.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!sizeValid ? (
          <div className="flex items-center gap-1.5 border-l-2 border-destructive/70 bg-muted/40 px-2.5 py-1.5 text-xs text-foreground">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
            <span className="tabular-nums">
              จำนวนสมาชิกควรอยู่ระหว่าง {competition.min_size}–
              {competition.max_size} คน (ปัจจุบัน {memberCount} คน)
            </span>
          </div>
        ) : null}

        {competition.recommended_roles.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">
              ความครอบคลุมบทบาทที่แนะนำ:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {competition.recommended_roles.map((role) => {
                const covered = assignedRolesSet.has(role.toLowerCase());
                return (
                  <span
                    key={role}
                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] ${
                      covered
                        ? "border border-primary/30 bg-primary/8 font-medium text-primary"
                        : "border border-dashed border-border text-muted-foreground"
                    }`}
                  >
                    {covered ? <Check className="h-3 w-3" /> : null}
                    {role}
                  </span>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div className="py-3">
        {team.members.length === 0 ? (
          <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
            ลากนักเรียนจากฝั่งซ้ายมาวางที่นี่ หรือกด &ldquo;เพิ่มเข้าทีม&rdquo;
          </div>
        ) : (
          <div className="divide-y divide-border">
            {team.members.map((member) => (
              <div
                key={member.user_id}
                className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {member.full_name}
                    {member.nickname ? ` (${member.nickname})` : ""}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span>{member.grade || "ไม่ระบุชั้นปี"}</span>
                    {member.skills.slice(0, 3).map((skill) => (
                      <span
                        key={skill}
                        className="rounded bg-muted px-1.5 py-0 font-mono text-[10px] text-muted-foreground"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Select
                    value={member.assigned_role}
                    onValueChange={(value) =>
                      onUpdateMemberRole(team.clientId, member.user_id, value)
                    }
                  >
                    <SelectTrigger className="h-7 w-[140px] rounded-md text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(
                        new Set([
                          ...competition.recommended_roles,
                          ...TECH_ROLES,
                          member.assigned_role,
                        ]),
                      ).map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemoveMember(team.clientId, member.user_id)}
                    aria-label={`นำ ${member.full_name} ออกจากทีม`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        {team.status === "confirmed" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onToggleStatus(team.clientId, "draft")}
            className="h-8 rounded-md text-xs"
          >
            เปลี่ยนเป็นแบบร่าง
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={busy || !sizeValid}
            title={
              sizeValid
                ? undefined
                : `ต้องมีสมาชิก ${competition.min_size}–${competition.max_size} คนก่อนยืนยัน`
            }
            onClick={() => onToggleStatus(team.clientId, "confirmed")}
            className="h-8 gap-1.5 rounded-md bg-primary text-xs text-primary-foreground hover:bg-primary/90"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            ยืนยันทีม
          </Button>
        )}

        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => onDeleteTeam(team.clientId)}
          className="h-8 rounded-md text-xs text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          ลบทีม
        </Button>
      </div>
    </section>
  );
}

export function TeamBuilderBoard({
  competition,
  interestedStudents,
  initialTeams,
  teachers,
  currentTeacherId,
}: TeamBuilderBoardProps) {
  const router = useRouter();
  const [teams, setTeams] = useState<EditableTeam[]>(() =>
    initialTeams.length > 0
      ? toEditableTeams(initialTeams)
      : [
          {
            clientId: "temp-team-1",
            name: "Team 1",
            advisor_id: currentTeacherId,
            status: "draft",
            members: [],
          },
        ],
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeStudent, setActiveStudent] =
    useState<InterestedStudentItem | null>(null);

  // Pool filters
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [selectedSkillFilters, setSelectedSkillFilters] = useState<string[]>(
    [],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const assignedStudentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const team of teams) {
      for (const m of team.members) {
        ids.add(m.user_id);
      }
    }
    return ids;
  }, [teams]);

  const unassignedStudents = useMemo(
    () =>
      interestedStudents.filter((s) => !assignedStudentIds.has(s.user_id)),
    [interestedStudents, assignedStudentIds],
  );

  const distinctGrades = useMemo(
    () =>
      Array.from(
        new Set(
          interestedStudents
            .map((s) => s.grade?.trim())
            .filter((g): g is string => Boolean(g)),
        ),
      ),
    [interestedStudents],
  );

  const availablePoolSkills = useMemo(() => {
    const set = new Set<string>();
    for (const s of interestedStudents) {
      for (const skill of s.skills) {
        set.add(skill);
      }
    }
    if (set.size === 0) {
      return [...TECH_SKILLS.slice(0, 8)];
    }
    return Array.from(set);
  }, [interestedStudents]);

  const filteredPool = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return unassignedStudents.filter((student) => {
      if (roleFilter !== "all" && student.preferred_role !== roleFilter) {
        return false;
      }
      if (gradeFilter !== "all" && (student.grade ?? "") !== gradeFilter) {
        return false;
      }
      if (selectedSkillFilters.length > 0) {
        const hasAllSkills = selectedSkillFilters.every((reqSkill) =>
          student.skills.includes(reqSkill),
        );
        if (!hasAllSkills) return false;
      }
      if (q.length > 0) {
        const haystack = [
          student.full_name,
          student.nickname ?? "",
          student.grade ?? "",
          student.preferred_role,
          student.note ?? "",
          ...student.skills,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [
    unassignedStudents,
    roleFilter,
    gradeFilter,
    selectedSkillFilters,
    searchQuery,
  ]);

  function toggleSkillFilter(skill: string) {
    setSelectedSkillFilters((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill],
    );
  }

  function assignStudentToTeam(
    student: InterestedStudentItem,
    targetClientId: string,
  ) {
    const targetTeam = teams.find((t) => t.clientId === targetClientId);
    if (!targetTeam) return;
    if (targetTeam.members.some((m) => m.user_id === student.user_id)) return;

    const newMember = toMemberDetail(student);

    setTeams((prev) =>
      prev.map((team) =>
        team.clientId === targetClientId
          ? { ...team, members: [...team.members, newMember] }
          : {
              ...team,
              members: team.members.filter(
                (m) => m.user_id !== student.user_id,
              ),
            },
      ),
    );
    setDirty(true);
  }

  function autoAssignBalancedTeams() {
    if (unassignedStudents.length === 0) {
      toast.info("นักเรียนที่ลงชื่อถูกจัดเข้าทีมครบทุกคนแล้ว");
      return;
    }

    const maxSize = Math.max(1, competition.max_size);
    const recommendedLower = competition.recommended_roles.map((r) =>
      r.toLowerCase(),
    );

    const nextTeams: EditableTeam[] = teams.map((team) => ({
      ...team,
      members: team.members.map((m) => ({ ...m, skills: [...m.skills] })),
    }));
    const remaining = [...unassignedStudents];
    const startCount = remaining.length;

    // Step A: Fill existing draft teams with open slots, prioritizing missing recommended roles
    for (const team of nextTeams) {
      if (team.status !== "draft") continue;
      while (team.members.length < maxSize && remaining.length > 0) {
        const currentRoles = new Set(
          team.members.map((m) => m.assigned_role.toLowerCase()),
        );
        const missingRecommended = new Set(
          recommendedLower.filter((r) => !currentRoles.has(r)),
        );

        let chosenIndex = 0;
        let bestScore = Number.NEGATIVE_INFINITY;
        for (let index = 0; index < remaining.length; index += 1) {
          const candidate = remaining[index];
          const simulated = [
            ...team.members.map((m) => ({
              user_id: m.user_id,
              assigned_role: m.assigned_role,
              grade: m.grade,
              skills: m.skills,
            })),
            {
              user_id: candidate.user_id,
              assigned_role: candidate.preferred_role,
              grade: candidate.grade,
              skills: candidate.skills,
            },
          ];
          const score = scoreTeam({
            members: simulated,
            competition: {
              min_size: competition.min_size,
              max_size: competition.max_size,
              recommended_roles: competition.recommended_roles,
              tech_stack_hints: competition.tech_stack_hints,
            },
          }).weighted;
          const roleBonus = missingRecommended.has(candidate.preferred_role.toLowerCase()) ? 0.2 : 0;
          if (score + roleBonus > bestScore) {
            bestScore = score + roleBonus;
            chosenIndex = index;
          }
        }

        const [picked] = remaining.splice(chosenIndex, 1);
        team.members.push(toMemberDetail(picked));
      }
    }

    // Step B: Create new balanced draft teams for any remaining students
    if (remaining.length > 0) {
      let numNewTeams = Math.max(1, Math.ceil(remaining.length / maxSize));
      while (
        numNewTeams > 1 &&
        Math.floor(remaining.length / numNewTeams) < competition.min_size
      ) {
        numNewTeams -= 1;
      }

      const seeds = Array.from({ length: numNewTeams }, (_, offset) => ({
        clientId: `temp-team-${Date.now()}-${nextTeams.length + offset + 1}`,
        name: `Team ${nextTeams.length + offset + 1}`,
        advisor_id: currentTeacherId,
      }));

      const optimized = optimizeTeams({
        students: remaining.map((student) => ({
          user_id: student.user_id,
          preferred_role: student.preferred_role,
          grade: student.grade,
          skills: student.skills,
        })),
        teams: seeds.map((seed) => ({
          id: seed.clientId,
          status: "draft",
          members: [],
        })),
        competition: {
          min_size: competition.min_size,
          max_size: competition.max_size,
          recommended_roles: competition.recommended_roles,
          tech_stack_hints: competition.tech_stack_hints,
        },
      });

      const byStudentId = new Map(
        remaining.map((student) => [student.user_id, student]),
      );
      for (const optimizedTeam of optimized.teams) {
        const seed = seeds.find((item) => item.clientId === optimizedTeam.id);
        if (!seed) continue;
        const members = optimizedTeam.members.flatMap((member) => {
          const student = byStudentId.get(member.user_id);
          if (!student) return [];
          return [
            toMemberDetail({ ...student, preferred_role: member.assigned_role }),
          ];
        });
        nextTeams.push({
          clientId: seed.clientId,
          name: seed.name,
          advisor_id: seed.advisor_id,
          status: "draft",
          members,
        });
      }
    }

    setTeams(nextTeams);
    setDirty(true);
    toast.success(
      `จัดนักเรียน ${startCount} คนลงทีมแบบสมดุลตามบทบาทแล้ว กรุณาตรวจสอบและกด "บันทึกทั้งหมด"`,
    );
  }

  function revertChanges() {
    setTeams(
      initialTeams.length > 0
        ? toEditableTeams(initialTeams)
        : [
            {
              clientId: "temp-team-1",
              name: "Team 1",
              advisor_id: currentTeacherId,
              status: "draft",
              members: [],
            },
          ],
    );
    setDirty(false);
    toast.info("ย้อนกลับไปใช้ข้อมูลทีมล่าสุดที่บันทึกไว้แล้ว");
  }

  function handleDragStart(event: DragStartEvent) {
    const rawId = String(event.active.id);
    if (!rawId.startsWith("student:")) return;
    const userId = rawId.slice("student:".length);
    const found = interestedStudents.find((s) => s.user_id === userId) ?? null;
    setActiveStudent(found);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveStudent(null);
    const { active, over } = event;
    if (!over) return;

    const rawActive = String(active.id);
    const rawOver = String(over.id);
    if (!rawActive.startsWith("student:") || !rawOver.startsWith("team:")) {
      return;
    }

    const userId = rawActive.slice("student:".length);
    const targetClientId = rawOver.slice("team:".length);
    const student = interestedStudents.find((s) => s.user_id === userId);
    if (student) {
      assignStudentToTeam(student, targetClientId);
    }
  }

  function addNewTeam() {
    const nextNum = teams.length + 1;
    setTeams((prev) => [
      ...prev,
      {
        clientId: `temp-team-${Date.now()}-${nextNum}`,
        name: `Team ${nextNum}`,
        advisor_id: currentTeacherId,
        status: "draft",
        members: [],
      },
    ]);
    setDirty(true);
  }

  async function persistTeams(
    nextTeams: EditableTeam[],
    toastMessage: string,
  ): Promise<boolean> {
    setSaving(true);
    try {
      const response = await fetch(
        `/api/teacher/competitions/${competition.id}/teams`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teams: nextTeams.map((team) => ({
              id: team.id,
              name: team.name.trim() || "Team",
              advisor_id: team.advisor_id || currentTeacherId,
              status: team.status,
              members: team.members.map((m) => ({
                user_id: m.user_id,
                assigned_role: m.assigned_role,
              })),
            })),
          }),
        },
      );

      const data = (await response.json()) as {
        teams?: TeamDetail[];
        error?: string;
      };
      if (!response.ok || !data.teams) {
        toast.error(data.error ?? "ไม่สามารถบันทึกการจัดทีมได้");
        return false;
      }

      setTeams(toEditableTeams(data.teams));
      setDirty(false);
      toast.success(toastMessage);
      router.refresh();
      return true;
    } catch {
      toast.error("เกิดข้อผิดพลาดในการบันทึกการจัดทีม");
      return false;
    } finally {
      setSaving(false);
    }
  }

  const catMeta = TECH_CATEGORY_META[competition.category];

  return (
    <div className="space-y-6">
      {/* Canvas Header */}
      <section className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
            <Link
              href="/teacher/review"
              className="inline-flex items-center gap-1 font-medium text-foreground/80 transition-colors hover:text-primary"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              กลับหน้าจัดการ
            </Link>
            <span aria-hidden="true">·</span>
            <span>{catMeta.shortLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              ขนาดทีม {competition.min_size}–{competition.max_size} คน
            </span>
            {dirty ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-primary">
                  มีการแก้ไขที่ยังไม่บันทึก
                </span>
              </>
            ) : null}
          </div>

          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            กระดานจัดทีม: {competition.title}
          </h1>

          <p className="text-xs tabular-nums text-muted-foreground">
            ผู้สนใจทั้งหมด {interestedStudents.length} คน · รอจัดทีม{" "}
            {unassignedStudents.length} คน · จัดลงทีมแล้ว{" "}
            {assignedStudentIds.size} คน
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving || unassignedStudents.length === 0}
            onClick={autoAssignBalancedTeams}
            className="gap-1.5 rounded-md"
          >
            <Wand2 className="h-3.5 w-3.5" />
            จัดทีมอัตโนมัติ
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addNewTeam}
            className="gap-1.5 rounded-md"
          >
            <Plus className="h-3.5 w-3.5" />
            สร้างทีมใหม่
          </Button>
          {dirty ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={revertChanges}
              className="gap-1.5 rounded-md text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              ย้อนกลับ
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={() => persistTeams(teams, "บันทึกการจัดทีมเรียบร้อยแล้ว")}
            className="gap-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            บันทึกทั้งหมด
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-md"
          >
            <a
              href={`/api/teacher/competitions/${competition.id}/teams/export`}
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </a>
          </Button>
        </div>
      </section>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left Panel: Unassigned Tech Pool */}
          <section className="h-fit space-y-4 rounded-md border border-border bg-background p-4 lg:col-span-5">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>นักเรียนรอจัดทีม ({filteredPool.length})</span>
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                กรองตามบทบาท ชั้นปี หรือทักษะ แล้วลากไปวางในทีมฝั่งขวา
              </p>
            </div>

            <div className="space-y-2.5 border-b border-border pb-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="ค้นหาชื่อ, ทักษะ, หมายเหตุ..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 rounded-md pl-8 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="h-8 rounded-md text-xs">
                    <SelectValue placeholder="ทุกบทบาท" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ทุกบทบาท</SelectItem>
                    {TECH_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={gradeFilter} onValueChange={setGradeFilter}>
                  <SelectTrigger className="h-8 rounded-md text-xs">
                    <SelectValue placeholder="ทุกชั้นปี" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ทุกชั้นปี</SelectItem>
                    {distinctGrades.map((grade) => (
                      <SelectItem key={grade} value={grade}>
                        {grade}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {availablePoolSkills.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {availablePoolSkills.map((skill) => {
                    const active = selectedSkillFilters.includes(skill);
                    return (
                      <button
                        key={skill}
                        type="button"
                        onClick={() => toggleSkillFilter(skill)}
                        className={`rounded border px-2 py-0.5 font-mono text-[10px] transition-colors ${
                          active
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        }`}
                      >
                        {skill}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className="space-y-2.5">
              {filteredPool.length === 0 ? (
                <div className="rounded-md border border-dashed border-border py-10 text-center text-xs text-muted-foreground">
                  {unassignedStudents.length === 0
                    ? "จัดนักเรียนที่ลงชื่อครบทุกทีมแล้ว"
                    : "ไม่พบนักเรียนที่ตรงกับตัวกรอง"}
                </div>
              ) : (
                filteredPool.map((student) => (
                  <DraggableStudentCard
                    key={student.user_id}
                    student={student}
                    teams={teams}
                    onAssign={assignStudentToTeam}
                  />
                ))
              )}
            </div>
          </section>

          {/* Right Panel: Teams Grid */}
          <div className="space-y-4 lg:col-span-7">
            {teams.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border py-14 text-center">
                <p className="text-sm text-muted-foreground">
                  ยังไม่มีทีมในรายการนี้ กด &ldquo;สร้างทีมใหม่&rdquo; เพื่อเริ่มต้นจัดทีม
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={addNewTeam}
                  className="rounded-md"
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  สร้าง Team 1
                </Button>
              </div>
            ) : (
              teams.map((team) => (
                <DroppableTeamCard
                  key={team.clientId}
                  team={team}
                  competition={competition}
                  teachers={teachers}
                  busy={saving}
                  onUpdateName={(clientId, name) => {
                    setTeams((prev) =>
                      prev.map((t) =>
                        t.clientId === clientId ? { ...t, name } : t,
                      ),
                    );
                    setDirty(true);
                  }}
                  onUpdateAdvisor={(clientId, advisorId) => {
                    setTeams((prev) =>
                      prev.map((t) =>
                        t.clientId === clientId
                          ? { ...t, advisor_id: advisorId || null }
                          : t,
                      ),
                    );
                    setDirty(true);
                  }}
                  onUpdateMemberRole={(clientId, userId, role) => {
                    setTeams((prev) =>
                      prev.map((t) =>
                        t.clientId === clientId
                          ? {
                              ...t,
                              members: t.members.map((m) =>
                                m.user_id === userId
                                  ? { ...m, assigned_role: role }
                                  : m,
                              ),
                            }
                          : t,
                      ),
                    );
                    setDirty(true);
                  }}
                  onRemoveMember={(clientId, userId) => {
                    setTeams((prev) =>
                      prev.map((t) =>
                        t.clientId === clientId
                          ? {
                              ...t,
                              members: t.members.filter(
                                (m) => m.user_id !== userId,
                              ),
                            }
                          : t,
                      ),
                    );
                    setDirty(true);
                  }}
                  onToggleStatus={async (clientId, nextStatus) => {
                    const previous = teams;
                    const updated = teams.map((t) =>
                      t.clientId === clientId
                        ? { ...t, status: nextStatus }
                        : t,
                    );
                    setTeams(updated);
                    setDirty(true);
                    const saved = await persistTeams(
                      updated,
                      nextStatus === "confirmed"
                        ? "ยืนยันทีมเรียบร้อยแล้ว (นักเรียนเห็นสมาชิกทีมได้แล้ว)"
                        : "เปลี่ยนสถานะทีมกลับเป็นแบบร่างแล้ว",
                    );
                    if (!saved) {
                      // Server rejected the save: never leave a false
                      // "confirmed" badge with nothing persisted.
                      setTeams(previous);
                      setDirty(true);
                    }
                  }}
                  onDeleteTeam={(clientId) => {
                    setTeams((prev) =>
                      prev.filter((t) => t.clientId !== clientId),
                    );
                    setDirty(true);
                  }}
                />
              ))
            )}
          </div>
        </div>

        <DragOverlay>
          {activeStudent ? (
            <div className="w-72 rounded-md border border-border bg-background p-3 shadow-md">
              <p className="text-sm font-medium text-foreground">
                {activeStudent.full_name}
                {activeStudent.nickname ? ` (${activeStudent.nickname})` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {activeStudent.preferred_role}
              </p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
