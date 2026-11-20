"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  Edit3,
  ExternalLink,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { SmartAddModal } from "@/components/competitions/smart-add-modal";
import { ScoutRunnerDialog } from "@/components/teacher/scout-runner-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CLASS_ROOMS,
  GRADE_LEVELS,
  formatClassroom,
  parseClassroom,
  splitFullName,
} from "@/lib/constants/classroom";
import {
  COMPETITION_STATUSES,
  COMPETITION_STATUS_META,
  TECH_CATEGORY_META,
  USER_ROLE_LABELS_TH,
  isCompetitionStatus,
  type CompetitionStatus,
  type UserRole,
} from "@/lib/constants/tech-taxonomy";
import { formatThaiDate } from "@/lib/utils/thai-date";
import type {
  AdminCompetitionItem,
  AdminTeamItem,
  AdminUserItem,
  Profile,
} from "@/types/database";

interface AdminDashboardClientProps {
  currentUserId: string;
  initialUsers: AdminUserItem[];
  initialCompetitions: AdminCompetitionItem[];
  initialTeams: AdminTeamItem[];
}

interface EditUserDraft {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  nickname: string;
  gradeLevel: string;
  room: string;
  legacyGrade: string;
  role: UserRole;
  contact: string;
  newPassword: string;
}

export function AdminDashboardClient({
  currentUserId,
  initialUsers,
  initialCompetitions,
  initialTeams,
}: AdminDashboardClientProps) {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserItem[]>(initialUsers);
  const [competitions, setCompetitions] =
    useState<AdminCompetitionItem[]>(initialCompetitions);
  const [teams] = useState<AdminTeamItem[]>(initialTeams);

  const [activeTab, setActiveTab] = useState<"users" | "competitions" | "teams">(
    "users",
  );

  // User filters
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<"all" | UserRole>("all");
  const [userGradeFilter, setUserGradeFilter] = useState<string>("all");
  const [userRoomFilter, setUserRoomFilter] = useState<string>("all");

  // Competition filters
  const [compSearch, setCompSearch] = useState("");
  const [compStatusFilter, setCompStatusFilter] = useState<
    "all" | CompetitionStatus
  >("all");
  const [busyCompId, setBusyCompId] = useState<string | null>(null);

  // Create user modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [createFirstName, setCreateFirstName] = useState("");
  const [createLastName, setCreateLastName] = useState("");
  const [createNickname, setCreateNickname] = useState("");
  const [createGradeLevel, setCreateGradeLevel] = useState("");
  const [createRoom, setCreateRoom] = useState("");
  const [createRole, setCreateRole] = useState<UserRole>("student");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createContact, setCreateContact] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);

  // Edit user modal state
  const [editDraft, setEditDraft] = useState<EditUserDraft | null>(null);
  const [savingUserEdit, setSavingUserEdit] = useState(false);

  // Delete user confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState<AdminUserItem | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);

  const stats = useMemo(
    () => ({
      totalUsers: users.length,
      studentCount: users.filter((u) => u.role === "student").length,
      teacherCount: users.filter((u) => u.role === "teacher").length,
      openCompetitions: competitions.filter((c) => c.status === "open").length,
      pendingReview: competitions.filter((c) => c.status === "pending_review")
        .length,
      confirmedTeams: teams.filter((t) => t.status === "confirmed").length,
    }),
    [users, competitions, teams],
  );

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (userRoleFilter !== "all" && u.role !== userRoleFilter) {
        return false;
      }

      const parsedClass = parseClassroom(u.grade);
      if (userGradeFilter !== "all" && parsedClass.gradeLevel !== userGradeFilter) {
        return false;
      }
      if (userRoomFilter !== "all" && parsedClass.room !== userRoomFilter) {
        return false;
      }

      if (q.length > 0) {
        const haystack = [
          u.full_name,
          u.nickname ?? "",
          u.email,
          u.grade ?? "",
          u.contact ?? "",
          ...u.skills,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [users, userSearch, userRoleFilter, userGradeFilter, userRoomFilter]);

  const filteredCompetitions = useMemo(() => {
    const q = compSearch.trim().toLowerCase();
    return competitions.filter((c) => {
      if (compStatusFilter !== "all" && c.status !== compStatusFilter) {
        return false;
      }
      if (q.length > 0) {
        const catMeta = TECH_CATEGORY_META[c.category];
        const haystack = [
          c.title,
          c.category,
          catMeta.labelTh,
          c.summary ?? "",
          c.eligibility ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [competitions, compSearch, compStatusFilter]);

  function openEditDialog(user: AdminUserItem) {
    const splitName = splitFullName(user.full_name);
    const parsedClass = parseClassroom(user.grade);
    setEditDraft({
      id: user.id,
      email: user.email,
      firstName: splitName.firstName,
      lastName: splitName.lastName,
      nickname: user.nickname ?? "",
      gradeLevel: parsedClass.gradeLevel,
      room: parsedClass.room,
      legacyGrade: parsedClass.customGrade,
      role: user.role,
      contact: user.contact ?? "",
      newPassword: "",
    });
  }

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    setCreatingUser(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: createFirstName.trim(),
          lastName: createLastName.trim(),
          nickname: createNickname.trim() || null,
          gradeLevel: createGradeLevel || null,
          room: createRoom || null,
          role: createRole,
          email: createEmail.trim(),
          password: createPassword,
          contact: createContact.trim() || null,
        }),
      });
      const data = (await response.json()) as {
        user?: AdminUserItem;
        error?: string;
      };
      if (!response.ok || !data.user) {
        toast.error(data.error ?? "ไม่สามารถสร้างบัญชีผู้ใช้ได้");
        return;
      }

      setUsers((prev) => [data.user!, ...prev]);
      setCreateOpen(false);
      setCreateFirstName("");
      setCreateLastName("");
      setCreateNickname("");
      setCreateGradeLevel("");
      setCreateRoom("");
      setCreateRole("student");
      setCreateEmail("");
      setCreatePassword("");
      setCreateContact("");
      toast.success(`เพิ่มบัญชี ${data.user.full_name} เรียบร้อยแล้ว`);
      router.refresh();
    } catch {
      toast.error("เกิดข้อผิดพลาดในการสร้างบัญชีผู้ใช้");
    } finally {
      setCreatingUser(false);
    }
  }

  async function handleSaveUserEdit(e: FormEvent) {
    e.preventDefault();
    if (!editDraft) return;

    setSavingUserEdit(true);
    try {
      const gradeFallback =
        formatClassroom(editDraft.gradeLevel, editDraft.room) ??
        (editDraft.legacyGrade.trim() || null);

      const response = await fetch(`/api/admin/users/${editDraft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: editDraft.firstName.trim(),
          lastName: editDraft.lastName.trim(),
          nickname: editDraft.nickname.trim() || null,
          gradeLevel: editDraft.gradeLevel || null,
          room: editDraft.room || null,
          grade: gradeFallback,
          role: editDraft.role,
          contact: editDraft.contact.trim() || null,
          newPassword: editDraft.newPassword.trim() || null,
        }),
      });
      const data = (await response.json()) as {
        user?: Profile;
        error?: string;
      };
      if (!response.ok || !data.user) {
        toast.error(data.error ?? "ไม่สามารถแก้ไขผู้ใช้ได้");
        return;
      }

      setUsers((prev) =>
        prev.map((item) =>
          item.id === editDraft.id ? { ...item, ...data.user } : item,
        ),
      );
      setEditDraft(null);
      toast.success("บันทึกข้อมูลผู้ใช้เรียบร้อยแล้ว");
      router.refresh();
    } catch {
      toast.error("เกิดข้อผิดพลาดในการบันทึกข้อมูลผู้ใช้");
    } finally {
      setSavingUserEdit(false);
    }
  }

  async function handleConfirmDeleteUser() {
    if (!deleteTarget) return;
    setDeletingUser(true);
    try {
      const response = await fetch(`/api/admin/users/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as {
        deleted?: boolean;
        error?: string;
      };
      if (!response.ok) {
        toast.error(data.error ?? "ไม่สามารถลบบัญชีผู้ใช้ได้");
        return;
      }

      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      toast.success(`ลบบัญชี ${deleteTarget.full_name} เรียบร้อยแล้ว`);
      setDeleteTarget(null);
      router.refresh();
    } catch {
      toast.error("เกิดข้อผิดพลาดในการลบผู้ใช้");
    } finally {
      setDeletingUser(false);
    }
  }

  async function handleCompetitionStatusChange(
    compId: string,
    nextStatus: CompetitionStatus,
  ) {
    setBusyCompId(compId);
    try {
      const response = await fetch(`/api/competitions/${compId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = (await response.json()) as {
        competition?: AdminCompetitionItem;
        error?: string;
      };
      if (!response.ok || !data.competition) {
        toast.error(data.error ?? "ไม่สามารถเปลี่ยนสถานะรายการได้");
        return;
      }

      setCompetitions((prev) =>
        prev.map((c) =>
          c.id === compId ? { ...c, ...data.competition, status: nextStatus } : c,
        ),
      );
      toast.success("อัปเดตสถานะรายการแข่งขันเรียบร้อยแล้ว");
      router.refresh();
    } catch {
      toast.error("เกิดข้อผิดพลาดในการอัปเดตสถานะ");
    } finally {
      setBusyCompId(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* Canvas Header */}
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1.5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground">
            ศูนย์ควบคุมระบบ
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Admin Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            จัดการบัญชีนักเรียน/อาจารย์ แก้ไขชั้นห้องเรียน ตรวจสอบงานแข่ง
            และติดตามสถานะทีมทั้งหมด
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="gap-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <UserPlus className="h-3.5 w-3.5" />
            เพิ่มผู้ใช้
          </Button>
          <ScoutRunnerDialog
            showReviewQueueLink
            onComplete={() => router.refresh()}
          />
          <SmartAddModal
            userRole="teacher"
            onCreated={() => router.refresh()}
            trigger={
              <Button size="sm" variant="outline" className="gap-1.5 rounded-md">
                <Plus className="h-3.5 w-3.5" />
                เพิ่มรายการแข่ง
              </Button>
            }
          />
          <Button asChild size="sm" variant="outline" className="rounded-md">
            <Link href="/teacher/review">คิวตรวจรายการ</Link>
          </Button>
        </div>
      </section>

      {/* Hairline KPI Strip */}
      <section className="grid grid-cols-2 divide-x divide-y divide-border border-y border-border sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
        <div className="px-4 py-3.5 first:pl-0">
          <p className="font-mono text-lg font-semibold tabular-nums text-foreground">
            {stats.totalUsers}
          </p>
          <p className="text-xs text-muted-foreground">ผู้ใช้ทั้งหมด</p>
        </div>
        <div className="px-4 py-3.5">
          <p className="font-mono text-lg font-semibold tabular-nums text-foreground">
            {stats.studentCount}
          </p>
          <p className="text-xs text-muted-foreground">นักเรียน</p>
        </div>
        <div className="px-4 py-3.5">
          <p className="font-mono text-lg font-semibold tabular-nums text-foreground">
            {stats.teacherCount}
          </p>
          <p className="text-xs text-muted-foreground">อาจารย์ / Admin</p>
        </div>
        <div className="px-4 py-3.5">
          <p className="font-mono text-lg font-semibold tabular-nums text-foreground">
            {stats.openCompetitions}
          </p>
          <p className="text-xs text-muted-foreground">เปิดรับสมัคร</p>
        </div>
        <div className="px-4 py-3.5">
          <p
            className={`font-mono text-lg font-semibold tabular-nums ${
              stats.pendingReview > 0 ? "text-primary" : "text-foreground"
            }`}
          >
            {stats.pendingReview}
          </p>
          <p className="text-xs text-muted-foreground">รอตรวจสอบ</p>
        </div>
        <div className="px-4 py-3.5 last:pr-0">
          <p className="font-mono text-lg font-semibold tabular-nums text-foreground">
            {stats.confirmedTeams}
          </p>
          <p className="text-xs text-muted-foreground">ทีมยืนยันแล้ว</p>
        </div>
      </section>

      {/* Underline Navigation Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (
            value === "users" ||
            value === "competitions" ||
            value === "teams"
          ) {
            setActiveTab(value);
          }
        }}
      >
        <TabsList
          variant="line"
          className="h-auto w-full justify-start gap-6 rounded-none border-b border-border bg-transparent p-0 group-data-horizontal/tabs:h-auto"
        >
          <TabsTrigger
            value="users"
            className="flex-none gap-2 rounded-none px-0 pb-2.5 text-sm font-medium after:bg-primary group-data-horizontal/tabs:after:bottom-0 data-active:font-semibold"
          >
            <span>จัดการผู้ใช้</span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {users.length}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="competitions"
            className="flex-none gap-2 rounded-none px-0 pb-2.5 text-sm font-medium after:bg-primary group-data-horizontal/tabs:after:bottom-0 data-active:font-semibold"
          >
            <span>จัดการรายการแข่งขัน</span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {competitions.length}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="teams"
            className="flex-none gap-2 rounded-none px-0 pb-2.5 text-sm font-medium after:bg-primary group-data-horizontal/tabs:after:bottom-0 data-active:font-semibold"
          >
            <span>ภาพรวมทีมแข่งขัน</span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {teams.length}
            </span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Users */}
        <TabsContent value="users" className="space-y-4 pt-5">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1 lg:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="ค้นหาชื่อ, อีเมล, ทักษะ หรือช่องทางติดต่อ..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="h-9 rounded-md pl-8 pr-8 text-sm"
              />
              {userSearch ? (
                <button
                  type="button"
                  onClick={() => setUserSearch("")}
                  aria-label="ล้างคำค้นหา"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Select
                value={userRoleFilter}
                onValueChange={(value) => {
                  if (
                    value === "all" ||
                    value === "student" ||
                    value === "teacher"
                  ) {
                    setUserRoleFilter(value);
                  }
                }}
              >
                <SelectTrigger className="h-9 w-36 rounded-md text-xs">
                  <SelectValue placeholder="ทุกสิทธิ์" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทุกสิทธิ์</SelectItem>
                  <SelectItem value="student">นักเรียน</SelectItem>
                  <SelectItem value="teacher">อาจารย์ / Admin</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={userGradeFilter}
                onValueChange={setUserGradeFilter}
              >
                <SelectTrigger className="h-9 w-28 rounded-md text-xs">
                  <SelectValue placeholder="ทุกชั้น" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทุกชั้น</SelectItem>
                  {GRADE_LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={userRoomFilter} onValueChange={setUserRoomFilter}>
                <SelectTrigger className="h-9 w-28 rounded-md text-xs">
                  <SelectValue placeholder="ทุกห้อง" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทุกห้อง</SelectItem>
                  {CLASS_ROOMS.map((num) => (
                    <SelectItem key={num} value={num}>
                      ห้อง {num}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="border-y border-border py-14 text-center text-sm text-muted-foreground">
              ไม่พบผู้ใช้ที่ตรงกับเงื่อนไขที่เลือก
            </div>
          ) : (
            <div className="divide-y divide-border border-y border-border">
              {filteredUsers.map((u) => {
                const isSelf = u.id === currentUserId;
                return (
                  <div
                    key={u.id}
                    className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">
                          {u.full_name}
                          {u.nickname ? ` (${u.nickname})` : ""}
                          {isSelf ? (
                            <span className="ml-1.5 text-xs font-normal text-primary">
                              (คุณ)
                            </span>
                          ) : null}
                        </p>
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                            u.role === "teacher"
                              ? "border border-primary/30 bg-primary/8 text-primary"
                              : "border border-border bg-muted/40 text-foreground/80"
                          }`}
                        >
                          {u.role === "teacher" ? "อาจารย์ / Admin" : "นักเรียน"}
                        </span>
                        {u.grade ? (
                          <span className="rounded border border-border px-2 py-0.5 font-mono text-[11px] text-foreground">
                            {u.grade}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{u.email}</span>
                        {u.contact ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{u.contact}</span>
                          </>
                        ) : null}
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          ทักษะ {u.skills.length} รายการ
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          ลงชื่อ {u.interest_count} งาน / {u.confirmed_team_count}{" "}
                          ทีม
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openEditDialog(u)}
                        className="h-8 gap-1 rounded-md text-xs"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        แก้ไข
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={isSelf}
                        onClick={() => setDeleteTarget(u)}
                        className="h-8 gap-1 rounded-md text-xs text-muted-foreground hover:text-destructive disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        ลบ
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Competitions */}
        <TabsContent value="competitions" className="space-y-4 pt-5">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="ค้นหาชื่องานแข่งหรือหมวด..."
                value={compSearch}
                onChange={(e) => setCompSearch(e.target.value)}
                className="h-9 rounded-md pl-8 text-sm"
              />
            </div>

            <Select
              value={compStatusFilter}
              onValueChange={(value) => {
                if (value === "all" || isCompetitionStatus(value)) {
                  setCompStatusFilter(value);
                }
              }}
            >
              <SelectTrigger className="h-9 w-full rounded-md text-xs sm:w-48">
                <SelectValue placeholder="ทุกสถานะ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกสถานะ</SelectItem>
                {COMPETITION_STATUSES.map((st) => (
                  <SelectItem key={st} value={st}>
                    {COMPETITION_STATUS_META[st].labelTh}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filteredCompetitions.length === 0 ? (
            <div className="border-y border-border py-14 text-center text-sm text-muted-foreground">
              ไม่พบรายการแข่งขันในเงื่อนไขที่เลือก
            </div>
          ) : (
            <div className="divide-y divide-border border-y border-border">
              {filteredCompetitions.map((comp) => {
                const catMeta = TECH_CATEGORY_META[comp.category];
                const isBusy = busyCompId === comp.id;

                return (
                  <div
                    key={comp.id}
                    className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">
                          {catMeta.shortLabel}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          ปิดรับ {formatThaiDate(comp.deadline, "short")}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          สนใจ {comp.interest_count} คน · {comp.team_count} ทีม
                          (ยืนยัน {comp.confirmed_team_count})
                        </span>
                      </div>

                      <p className="text-sm font-medium text-foreground">
                        <Link
                          href={`/competitions/${comp.id}`}
                          className="transition-colors hover:text-primary"
                        >
                          {comp.title}
                        </Link>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={comp.status}
                        disabled={isBusy}
                        onValueChange={(value) => {
                          if (isCompetitionStatus(value)) {
                            handleCompetitionStatusChange(comp.id, value);
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 w-44 rounded-md text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COMPETITION_STATUSES.map((st) => (
                            <SelectItem key={st} value={st}>
                              {COMPETITION_STATUS_META[st].labelTh}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 rounded-md text-xs"
                      >
                        <Link href={`/teacher/competitions/${comp.id}/teams`}>
                          <Users className="h-3.5 w-3.5" />
                          จัดทีม
                        </Link>
                      </Button>

                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 rounded-md text-xs"
                      >
                        <a
                          href={`/api/teacher/competitions/${comp.id}/teams/export`}
                        >
                          <Download className="h-3.5 w-3.5" />
                          CSV
                        </a>
                      </Button>

                      {comp.source_url ? (
                        <Button
                          asChild
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 rounded-md text-muted-foreground"
                          title="เปิดลิงก์ต้นทาง"
                        >
                          <a
                            href={comp.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab 3: Teams Overview */}
        <TabsContent value="teams" className="space-y-4 pt-5">
          {teams.length === 0 ? (
            <div className="border-y border-border py-14 text-center text-sm text-muted-foreground">
              ยังไม่มีทีมในระบบ เลือกรายการแข่งขันและกด &ldquo;จัดทีม&rdquo;
              เพื่อเริ่มต้นจัดทีม
            </div>
          ) : (
            <div className="divide-y divide-border border-y border-border">
              {teams.map((team) => (
                <div key={team.id} className="space-y-2.5 py-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">
                          {team.name}
                        </p>
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                            team.status === "confirmed"
                              ? "border border-primary/30 bg-primary/8 text-primary"
                              : "border border-border text-muted-foreground"
                          }`}
                        >
                          {team.status === "confirmed" ? "ยืนยันแล้ว" : "แบบร่าง"}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          สมาชิก {team.members.length} คน
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        รายการ:{" "}
                        <Link
                          href={`/competitions/${team.competition_id}`}
                          className="text-foreground/80 hover:text-primary hover:underline"
                        >
                          {team.competition_title}
                        </Link>
                        {" · "}
                        ที่ปรึกษา: {team.advisor_name ?? "ยังไม่ระบุ"}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-md text-xs"
                      >
                        <Link
                          href={`/teacher/competitions/${team.competition_id}/teams`}
                        >
                          เปิดกระดานจัดทีม
                        </Link>
                      </Button>
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 rounded-md text-xs"
                      >
                        <a
                          href={`/api/teacher/competitions/${team.competition_id}/teams/export`}
                        >
                          <Download className="h-3.5 w-3.5" />
                          CSV
                        </a>
                      </Button>
                    </div>
                  </div>

                  {team.members.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {team.members.map((m) => (
                        <span
                          key={m.user_id}
                          className="rounded border border-border bg-muted/30 px-2 py-0.5 text-xs text-foreground"
                        >
                          {m.full_name}
                          {m.nickname ? ` (${m.nickname})` : ""}
                          {m.grade ? ` · ${m.grade}` : ""}
                          <span className="ml-1 text-muted-foreground">
                            · {m.assigned_role}
                          </span>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>เพิ่มบัญชีผู้ใช้ใหม่</DialogTitle>
            <DialogDescription>
              สร้างบัญชีนักเรียนหรืออาจารย์ พร้อมกำหนดชั้นและห้องเรียน (1–14)
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="admin-create-first">ชื่อ *</Label>
                <Input
                  id="admin-create-first"
                  required
                  value={createFirstName}
                  onChange={(e) => setCreateFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-create-last">นามสกุล *</Label>
                <Input
                  id="admin-create-last"
                  required
                  value={createLastName}
                  onChange={(e) => setCreateLastName(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="admin-create-nickname">ชื่อเล่น</Label>
                <Input
                  id="admin-create-nickname"
                  placeholder="เช่น นนท์"
                  value={createNickname}
                  onChange={(e) => setCreateNickname(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>ชั้น</Label>
                <Select
                  value={createGradeLevel || "none"}
                  onValueChange={(value) => {
                    const next = value === "none" ? "" : value;
                    setCreateGradeLevel(next);
                    if (!next) setCreateRoom("");
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="เลือกชั้น" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">ไม่ระบุชั้น</SelectItem>
                    {GRADE_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>ห้อง (1–14)</Label>
                <Select
                  value={createRoom || "none"}
                  onValueChange={(value) =>
                    setCreateRoom(value === "none" ? "" : value)
                  }
                  disabled={!createGradeLevel}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="เลือกห้อง" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">ไม่ระบุห้อง</SelectItem>
                    {CLASS_ROOMS.map((num) => (
                      <SelectItem key={num} value={num}>
                        ห้อง {num}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>สิทธิ์การใช้งาน</Label>
                <Select
                  value={createRole}
                  onValueChange={(value) =>
                    setCreateRole(value === "teacher" ? "teacher" : "student")
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">
                      {USER_ROLE_LABELS_TH.student}
                    </SelectItem>
                    <SelectItem value="teacher">อาจารย์ / Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="admin-create-contact">ช่องทางติดต่อ</Label>
                <Input
                  id="admin-create-contact"
                  placeholder="Discord / LINE"
                  value={createContact}
                  onChange={(e) => setCreateContact(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="admin-create-email">อีเมล *</Label>
              <Input
                id="admin-create-email"
                type="email"
                required
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="admin-create-password">
                รหัสผ่านเริ่มต้น * (อย่างน้อย 8 ตัวอักษร)
              </Label>
              <Input
                id="admin-create-password"
                type="password"
                required
                minLength={8}
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                ยกเลิก
              </Button>
              <Button type="submit" disabled={creatingUser} className="gap-1.5">
                {creatingUser ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                สร้างบัญชี
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog
        open={Boolean(editDraft)}
        onOpenChange={(open) => {
          if (!open) setEditDraft(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>แก้ไขข้อมูลผู้ใช้</DialogTitle>
            <DialogDescription>
              {editDraft?.email ?? ""}
            </DialogDescription>
          </DialogHeader>

          {editDraft ? (
            <form onSubmit={handleSaveUserEdit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="admin-edit-first">ชื่อ *</Label>
                  <Input
                    id="admin-edit-first"
                    required
                    value={editDraft.firstName}
                    onChange={(e) =>
                      setEditDraft({ ...editDraft, firstName: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-edit-last">นามสกุล</Label>
                  <Input
                    id="admin-edit-last"
                    value={editDraft.lastName}
                    onChange={(e) =>
                      setEditDraft({ ...editDraft, lastName: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="admin-edit-nickname">ชื่อเล่น</Label>
                  <Input
                    id="admin-edit-nickname"
                    placeholder="เช่น นนท์"
                    value={editDraft.nickname}
                    onChange={(e) =>
                      setEditDraft({ ...editDraft, nickname: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>ชั้น</Label>
                  <Select
                    value={editDraft.gradeLevel || "none"}
                    onValueChange={(value) => {
                      const next = value === "none" ? "" : value;
                      setEditDraft({
                        ...editDraft,
                        gradeLevel: next,
                        room: next ? editDraft.room : "",
                        legacyGrade: next ? "" : editDraft.legacyGrade,
                      });
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="เลือกชั้น" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">ไม่ระบุชั้น</SelectItem>
                      {GRADE_LEVELS.map((level) => (
                        <SelectItem key={level} value={level}>
                          {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>ห้อง (1–14)</Label>
                  <Select
                    value={editDraft.room || "none"}
                    onValueChange={(value) =>
                      setEditDraft({
                        ...editDraft,
                        room: value === "none" ? "" : value,
                      })
                    }
                    disabled={!editDraft.gradeLevel}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="เลือกห้อง" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">ไม่ระบุห้อง</SelectItem>
                      {CLASS_ROOMS.map((num) => (
                        <SelectItem key={num} value={num}>
                          ห้อง {num}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {!editDraft.gradeLevel && editDraft.legacyGrade ? (
                <div className="space-y-1.5">
                  <Label htmlFor="admin-edit-legacy">ข้อมูลชั้นเดิม</Label>
                  <Input
                    id="admin-edit-legacy"
                    value={editDraft.legacyGrade}
                    onChange={(e) =>
                      setEditDraft({
                        ...editDraft,
                        legacyGrade: e.target.value,
                      })
                    }
                  />
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>สิทธิ์ในระบบ</Label>
                  <Select
                    value={editDraft.role}
                    onValueChange={(value) =>
                      setEditDraft({
                        ...editDraft,
                        role: value === "teacher" ? "teacher" : "student",
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="student">
                        {USER_ROLE_LABELS_TH.student}
                      </SelectItem>
                      <SelectItem value="teacher">อาจารย์ / Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="admin-edit-contact">ช่องทางติดต่อ</Label>
                  <Input
                    id="admin-edit-contact"
                    value={editDraft.contact}
                    onChange={(e) =>
                      setEditDraft({ ...editDraft, contact: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="admin-edit-password">
                  ตั้งรหัสผ่านใหม่ (เว้นว่างหากไม่ต้องการเปลี่ยน)
                </Label>
                <Input
                  id="admin-edit-password"
                  type="password"
                  minLength={8}
                  placeholder="อย่างน้อย 8 ตัวอักษร"
                  value={editDraft.newPassword}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, newPassword: e.target.value })
                  }
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditDraft(null)}
                >
                  ยกเลิก
                </Button>
                <Button
                  type="submit"
                  disabled={savingUserEdit}
                  className="gap-1.5"
                >
                  {savingUserEdit ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  บันทึกการแก้ไข
                </Button>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>ยืนยันการลบบัญชีผู้ใช้</DialogTitle>
            <DialogDescription>
              ต้องการลบบัญชี{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.full_name}
              </span>{" "}
              ({deleteTarget?.email}) ออกจากระบบใช่หรือไม่?
              ข้อมูลการลงชื่อเข้าแข่งขันของผู้ใช้นี้จะถูกลบทั้งหมด
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
            >
              ยกเลิก
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deletingUser}
              onClick={handleConfirmDeleteUser}
            >
              {deletingUser ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : null}
              ลบบัญชีถาวร
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
