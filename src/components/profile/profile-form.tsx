"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ExternalLink,
  GitBranch,
  Loader2,
  Plus,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  CLASS_ROOMS,
  GRADE_LEVELS,
  formatClassroom,
  joinFullName,
  parseClassroom,
  splitFullName,
} from "@/lib/constants/classroom";
import {
  TECH_SKILLS,
  TECH_SKILL_GROUPS,
  USER_ROLE_LABELS_TH,
} from "@/lib/constants/tech-taxonomy";
import type { Profile } from "@/types/database";

interface ProfileFormProps {
  initialProfile: Profile;
}

const PRESET_SKILL_SET = new Set<string>(TECH_SKILLS);

interface ProfileBaseline {
  firstName: string;
  lastName: string;
  nickname: string;
  grade: string;
  contact: string;
  githubUrl: string;
  portfolioUrl: string;
  directoryVisible: boolean;
  skillsKey: string;
}

function toBaseline(profile: Profile): ProfileBaseline {
  const split = splitFullName(profile.full_name);
  return {
    firstName: split.firstName,
    lastName: split.lastName,
    nickname: profile.nickname ?? "",
    grade: profile.grade ?? "",
    contact: profile.contact ?? "",
    githubUrl: profile.github_url ?? "",
    portfolioUrl: profile.portfolio_url ?? "",
    directoryVisible: profile.directory_visible,
    skillsKey: JSON.stringify(profile.skills),
  };
}

export function ProfileForm({ initialProfile }: ProfileFormProps) {
  const router = useRouter();
  const initialName = splitFullName(initialProfile.full_name);
  const initialClass = parseClassroom(initialProfile.grade);

  const [baseline, setBaseline] = useState<ProfileBaseline>(() =>
    toBaseline(initialProfile),
  );
  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);
  const [nickname, setNickname] = useState(initialProfile.nickname ?? "");
  const [gradeLevel, setGradeLevel] = useState<string>(initialClass.gradeLevel);
  const [room, setRoom] = useState<string>(initialClass.room);
  const [legacyGrade, setLegacyGrade] = useState<string>(
    initialClass.customGrade,
  );
  const [contact, setContact] = useState(initialProfile.contact ?? "");
  const [githubUrl, setGithubUrl] = useState(initialProfile.github_url ?? "");
  const [portfolioUrl, setPortfolioUrl] = useState(
    initialProfile.portfolio_url ?? "",
  );
  const [skills, setSkills] = useState<string[]>(initialProfile.skills);
  const [directoryVisible, setDirectoryVisible] = useState(
    initialProfile.directory_visible,
  );
  const [customSkillInput, setCustomSkillInput] = useState("");
  const [saving, setSaving] = useState(false);

  const customSkills = skills.filter((s) => !PRESET_SKILL_SET.has(s));
  const computedGrade =
    formatClassroom(gradeLevel, room) ?? (legacyGrade.trim() || null);
  const combinedFullName = joinFullName(firstName, lastName);

  const isDirty = useMemo(() => {
    return (
      firstName !== baseline.firstName ||
      lastName !== baseline.lastName ||
      nickname !== baseline.nickname ||
      (computedGrade ?? "") !== baseline.grade ||
      contact !== baseline.contact ||
      githubUrl !== baseline.githubUrl ||
      portfolioUrl !== baseline.portfolioUrl ||
      JSON.stringify(skills) !== baseline.skillsKey ||
      directoryVisible !== baseline.directoryVisible
    );
  }, [
    firstName,
    lastName,
    nickname,
    computedGrade,
    contact,
    githubUrl,
    portfolioUrl,
    skills,
    directoryVisible,
    baseline,
  ]);

  const completeness = useMemo(() => {
    const missing: string[] = [];
    let completed = 0;

    if (combinedFullName.length >= 2 && Boolean(computedGrade)) {
      completed += 1;
    } else if (combinedFullName.length < 2) {
      missing.push("ชื่อ-นามสกุล");
    } else {
      missing.push("ชั้น/ห้องเรียน");
    }

    if (contact.trim().length > 0) {
      completed += 1;
    } else {
      missing.push("ช่องทางติดต่อ (Discord / LINE)");
    }

    if (githubUrl.trim().length > 0 || portfolioUrl.trim().length > 0) {
      completed += 1;
    } else {
      missing.push("ลิงก์ GitHub หรือ Portfolio");
    }

    if (skills.length >= 3) {
      completed += 1;
    } else {
      missing.push(`ทักษะอย่างน้อย 3 รายการ (อีก ${3 - skills.length})`);
    }

    return {
      completed,
      total: 4,
      percentage: completed * 25,
      missing,
    };
  }, [
    combinedFullName,
    computedGrade,
    contact,
    githubUrl,
    portfolioUrl,
    skills.length,
  ]);

  function toggleSkill(skill: string) {
    setSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill],
    );
  }

  function addCustomSkill() {
    const trimmed = customSkillInput.trim();
    if (!trimmed) return;
    if (skills.length >= 30) {
      toast.error("เลือกทักษะได้สูงสุด 30 รายการ");
      return;
    }
    if (!skills.includes(trimmed)) {
      setSkills((prev) => [...prev, trimmed]);
    }
    setCustomSkillInput("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (combinedFullName.length < 2) {
      toast.error("กรุณากรอกชื่อและนามสกุลให้ครบถ้วน");
      return;
    }
    setSaving(true);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: combinedFullName,
          nickname: nickname.trim() || null,
          grade: computedGrade,
          skills,
          contact: contact.trim() || null,
          github_url: githubUrl.trim() || null,
          portfolio_url: portfolioUrl.trim() || null,
          directory_visible: directoryVisible,
        }),
      });

      const data = (await response.json()) as {
        profile?: Profile;
        error?: string;
      };

      if (!response.ok) {
        toast.error(data.error ?? "ไม่สามารถบันทึกโปรไฟล์ได้");
        return;
      }

      if (data.profile) {
        setBaseline(toBaseline(data.profile));
      } else {
        setBaseline({
          firstName,
          lastName,
          nickname,
          grade: computedGrade ?? "",
          contact,
          githubUrl,
          portfolioUrl,
          skillsKey: JSON.stringify(skills),
          directoryVisible,
        });
      }

      toast.success("บันทึกโปรไฟล์สาย Tech เรียบร้อยแล้ว");
      router.refresh();
    } catch {
      toast.error("เกิดข้อผิดพลาดในการบันทึกโปรไฟล์");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Live Profile Completeness Bar */}
      <section className="space-y-2.5 border-b border-border pb-6">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium text-foreground">
            ความพร้อมสำหรับจับคู่ทีมแข่งขัน
          </span>
          <span className="font-mono font-semibold tabular-nums text-primary">
            {completeness.percentage}%
          </span>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${completeness.percentage}%` }}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          {completeness.missing.length === 0
            ? "โปรไฟล์พร้อมสำหรับจับคู่ทีมแล้ว ระบบจะนำทักษะเหล่านี้ไปจัดอันดับงานแข่งให้ในหน้าแรก"
            : `ยังขาด: ${completeness.missing.join(" · ")}`}
        </p>
      </section>

      {/* Section 1: Personal Info & Classroom */}
      <section className="grid gap-6 border-b border-border pb-8 lg:grid-cols-12">
        <div className="space-y-1.5 lg:col-span-4">
          <h2 className="text-sm font-semibold text-foreground">
            ข้อมูลส่วนตัวและห้องเรียน
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            บทบาทบัญชี: {USER_ROLE_LABELS_TH[initialProfile.role]}
            <br />
            ข้อมูลนี้ช่วยให้อาจารย์จับคู่ทีมและติดต่อคุณได้สะดวก
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-8">
          <div className="space-y-1.5">
            <Label htmlFor="profile-first-name">ชื่อ *</Label>
            <Input
              id="profile-first-name"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-last-name">นามสกุล</Label>
            <Input
              id="profile-last-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-nickname">ชื่อเล่น</Label>
            <Input
              id="profile-nickname"
              placeholder="เช่น นนท์"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-grade-level">ชั้น</Label>
            <Select
              value={gradeLevel || "none"}
              onValueChange={(value) => {
                const next = value === "none" ? "" : value;
                setGradeLevel(next);
                if (next) setLegacyGrade("");
                if (!next) setRoom("");
              }}
            >
              <SelectTrigger id="profile-grade-level" className="w-full">
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
            <Label htmlFor="profile-room">ห้อง (1–14)</Label>
            <Select
              value={room || "none"}
              onValueChange={(value) => {
                setRoom(value === "none" ? "" : value);
              }}
              disabled={!gradeLevel}
            >
              <SelectTrigger id="profile-room" className="w-full">
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

          {!gradeLevel && legacyGrade ? (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="profile-legacy-grade">ชั้น/แผนกเดิม</Label>
              <Input
                id="profile-legacy-grade"
                value={legacyGrade}
                onChange={(e) => setLegacyGrade(e.target.value)}
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="profile-email">อีเมล</Label>
            <Input id="profile-email" value={initialProfile.email} disabled />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-contact">
              ช่องทางติดต่อ (Discord / LINE ID)
            </Label>
            <Input
              id="profile-contact"
              placeholder="เช่น discord: dev_krit หรือ line: @krit"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-github" className="flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
              GitHub URL
            </Label>
            <Input
              id="profile-github"
              type="url"
              placeholder="https://github.com/username"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="profile-portfolio"
              className="flex items-center gap-1.5"
            >
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              Portfolio / Kaggle / Website URL
            </Label>
            <Input
              id="profile-portfolio"
              type="url"
              placeholder="https://kaggle.com/username"
              value={portfolioUrl}
              onChange={(e) => setPortfolioUrl(e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Section 2: Tech Stack & Skills */}
      <section className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-1.5 lg:col-span-4">
          <div className="flex items-center justify-between gap-2 lg:block">
            <h2 className="text-sm font-semibold text-foreground">
              ทักษะและเครื่องมือสาย Tech
            </h2>
            <p className="mt-1 font-mono text-xs font-medium tabular-nums text-primary">
              เลือกแล้ว {skills.length} ทักษะ
            </p>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            เลือกภาษา เฟรมเวิร์ก หรือเครื่องมือที่ใช้งานได้จริง
            เพื่อให้อาจารย์จัดทีมได้สมดุล
          </p>
        </div>

        <div className="space-y-6 lg:col-span-8">
          {TECH_SKILL_GROUPS.map((group) => (
            <div key={group.id} className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {group.labelTh}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {group.skills.map((skill) => {
                  const selected = skills.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-xs font-medium transition-colors ${
                        selected
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      }`}
                    >
                      {selected ? <Check className="h-3 w-3" /> : null}
                      {skill}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="space-y-2.5 border-t border-border pt-5">
            <Label htmlFor="custom-skill">เพิ่มทักษะเพิ่มเติม (Custom Tag)</Label>
            <div className="flex gap-2">
              <Input
                id="custom-skill"
                placeholder="เช่น Rust, Go, FastAPI, Kubernetes, Unreal Engine"
                value={customSkillInput}
                onChange={(e) => setCustomSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomSkill();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={addCustomSkill}
                disabled={!customSkillInput.trim()}
                className="rounded-md"
              >
                <Plus className="mr-1 h-4 w-4" />
                เพิ่ม
              </Button>
            </div>

            {customSkills.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {customSkills.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2.5 py-1 font-mono text-xs text-foreground"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => toggleSkill(tag)}
                      aria-label={`ลบทักษะ ${tag}`}
                      className="ml-0.5 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* Section 3: Directory visibility */}
      <section className="grid gap-6 border-t border-border pt-8 lg:grid-cols-12">
        <div className="space-y-1.5 lg:col-span-4">
          <h2 className="text-sm font-semibold text-foreground">การเปิดเผยโปรไฟล์</h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            ถ้าเปิด นักเรียนคนอื่นจะเห็นชื่อ ชื่อเล่น ห้องเรียน และทักษะของคุณในหน้าคนในสาย Tech
            อีเมล ช่องทางติดต่อ และลิงก์ส่วนตัวจะไม่ปรากฏในหน้านั้น
            ปิดอยู่โดยค่าเริ่มต้นและเปลี่ยนได้ทุกเมื่อ
          </p>
        </div>
        <div className="lg:col-span-8">
          <label
            htmlFor="profile-directory-visible"
            className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border bg-muted/30 p-4"
          >
            <span>
              <span className="block text-sm font-medium text-foreground">
                ให้คนอื่นค้นพบโปรไฟล์ของฉัน
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                ใช้เพื่อช่วยจัดทีมก่อนการแข่งขัน
              </span>
            </span>
            <Switch
              id="profile-directory-visible"
              checked={directoryVisible}
              onCheckedChange={setDirectoryVisible}
              aria-label="ให้คนอื่นค้นพบโปรไฟล์ของฉัน"
            />
          </label>
        </div>
      </section>

      {/* Bottom Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <p className="text-xs text-muted-foreground">
          {isDirty ? (
            <span className="font-medium text-primary">
              มีการแก้ไขที่ยังไม่บันทึก
            </span>
          ) : (
            "ข้อมูลเป็นปัจจุบัน"
          )}
        </p>

        <Button
          type="submit"
          disabled={saving}
          className="gap-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          บันทึกโปรไฟล์สาย Tech
        </Button>
      </div>
    </form>
  );
}
