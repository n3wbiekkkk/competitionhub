"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Check,
  ExternalLink,
  GitBranch,
  Hash,
  Loader2,
  MessageCircle,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AccountSection } from "@/components/account/account-section";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  TECH_SKILLS,
  TECH_SKILL_GROUPS,
} from "@/lib/constants/tech-taxonomy";
import { getInitials } from "@/lib/utils/initials";
import { parseClassroom } from "@/lib/constants/classroom";
import type { Profile } from "@/types/database";

const PRESET_SKILL_SET = new Set<string>(TECH_SKILLS);

interface ProfileBaseline {
  bio: string;
  avatarUrl: string;
  contact: string;
  githubUrl: string;
  portfolioUrl: string;
  discordUrl: string;
  lineUrl: string;
  directoryVisible: boolean;
  skillsKey: string;
}

function toBaseline(profile: Profile): ProfileBaseline {
  return {
    bio: profile.bio ?? "",
    avatarUrl: profile.avatar_url ?? "",
    contact: profile.contact ?? "",
    githubUrl: profile.github_url ?? "",
    portfolioUrl: profile.portfolio_url ?? "",
    discordUrl: profile.discord_url ?? "",
    lineUrl: profile.line_url ?? "",
    directoryVisible: profile.directory_visible,
    skillsKey: JSON.stringify(profile.skills),
  };
}

export function ProfileForm({ initialProfile }: { initialProfile: Profile }) {
  const [profile, setProfile] = useState(initialProfile);
  const [baseline, setBaseline] = useState<ProfileBaseline>(() =>
    toBaseline(initialProfile),
  );

  const [bio, setBio] = useState(initialProfile.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initialProfile.avatar_url ?? "");
  const [contact, setContact] = useState(initialProfile.contact ?? "");
  const [githubUrl, setGithubUrl] = useState(initialProfile.github_url ?? "");
  const [portfolioUrl, setPortfolioUrl] = useState(
    initialProfile.portfolio_url ?? "",
  );
  const [discordUrl, setDiscordUrl] = useState(initialProfile.discord_url ?? "");
  const [lineUrl, setLineUrl] = useState(initialProfile.line_url ?? "");
  const [skills, setSkills] = useState<string[]>(initialProfile.skills);
  const [directoryVisible, setDirectoryVisible] = useState(
    initialProfile.directory_visible,
  );
  const [customSkillInput, setCustomSkillInput] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const classroom = parseClassroom(profile.grade);
  const classroomLabel = classroom.gradeLevel
    ? `${classroom.gradeLevel}${classroom.room ? `/${classroom.room}` : ""}`
    : "ยังไม่ระบุห้องเรียน";

  const isDirty = useMemo(
    () =>
      bio !== baseline.bio ||
      avatarUrl !== baseline.avatarUrl ||
      contact !== baseline.contact ||
      githubUrl !== baseline.githubUrl ||
      portfolioUrl !== baseline.portfolioUrl ||
      discordUrl !== baseline.discordUrl ||
      lineUrl !== baseline.lineUrl ||
      directoryVisible !== baseline.directoryVisible ||
      JSON.stringify(skills) !== baseline.skillsKey,
    [bio, avatarUrl, contact, githubUrl, portfolioUrl, discordUrl, lineUrl, directoryVisible, skills, baseline],
  );

  const checklist = useMemo(
    () => [
      {
        label: "ชื่อและห้องเรียน",
        done: profile.full_name.trim().length >= 2 && Boolean(classroom.gradeLevel),
        href: "/settings#account",
      },
      { label: "ช่องทางติดต่อ", done: contact.trim().length > 0, href: "#contact" },
      {
        label: "ลิงก์ผลงาน",
        done: githubUrl.trim().length > 0 || portfolioUrl.trim().length > 0,
        href: "#links",
      },
      { label: "ทักษะอย่างน้อย 3 รายการ", done: skills.length >= 3, href: "#skills" },
    ],
    [profile.full_name, classroom.gradeLevel, contact, githubUrl, portfolioUrl, skills.length],
  );
  const completed = checklist.filter((item) => item.done).length;
  const percentage = completed * 25;

  function toggleSkill(skill: string) {
    setSkills((prev) =>
      prev.includes(skill) ? prev.filter((item) => item !== skill) : [...prev, skill],
    );
  }

  function addCustomSkill() {
    const trimmed = customSkillInput.trim();
    if (!trimmed) return;
    if (skills.length >= 30) {
      toast.error("เลือกทักษะได้สูงสุด 30 รายการ");
      return;
    }
    if (!skills.includes(trimmed)) setSkills((prev) => [...prev, trimmed]);
    setCustomSkillInput("");
  }

  async function uploadAvatar(file: File) {
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as { avatarUrl?: string; error?: string };
      if (!response.ok || !data.avatarUrl) {
        toast.error(data.error ?? "ไม่สามารถอัปโหลดภาพได้");
        return;
      }
      setAvatarUrl(data.avatarUrl);
      setBaseline((prev) => ({ ...prev, avatarUrl: data.avatarUrl! }));
      setProfile((prev) => ({ ...prev, avatar_url: data.avatarUrl! }));
      toast.success("อัปเดตรูปโปรไฟล์แล้ว");
    } catch {
      toast.error("เกิดข้อผิดพลาดขณะอัปโหลดภาพ");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function removeAvatar() {
    try {
      const response = await fetch("/api/profile/avatar", { method: "DELETE" });
      if (!response.ok) throw new Error("remove failed");
      setAvatarUrl("");
      setBaseline((prev) => ({ ...prev, avatarUrl: "" }));
      setProfile((prev) => ({ ...prev, avatar_url: null }));
      toast.success("ลบรูปโปรไฟล์แล้ว");
    } catch {
      toast.error("ไม่สามารถลบรูปโปรไฟล์ได้");
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: profile.full_name,
          grade: profile.grade,
          skills,
          bio: bio.trim() || null,
          contact: contact.trim() || null,
          github_url: githubUrl.trim() || null,
          portfolio_url: portfolioUrl.trim() || null,
          discord_url: discordUrl.trim() || null,
          line_url: lineUrl.trim() || null,
          directory_visible: directoryVisible,
        }),
      });
      const data = (await response.json()) as { profile?: Profile; error?: string };
      if (!response.ok || !data.profile) {
        toast.error(data.error ?? "ไม่สามารถบันทึกโปรไฟล์ได้");
        return;
      }
      setProfile(data.profile);
      setBaseline(toBaseline(data.profile));
      toast.success("บันทึกโปรไฟล์แล้ว");
    } catch {
      toast.error("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      <AccountSection
        id="identity"
        title="ตัวตนของฉัน"
        description="ภาพและข้อมูลสั้น ๆ ที่ช่วยให้เพื่อนรู้จักคุณก่อนจัดทีม"
      >
        <div className="flex flex-col gap-5 rounded-2xl border border-border bg-muted/25 p-5 sm:flex-row sm:items-center">
          <Avatar className="size-20 rounded-2xl sm:size-24">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt="รูปโปรไฟล์" /> : null}
            <AvatarFallback className="font-mono text-xl font-semibold tabular-nums text-sage-foreground">
              {getInitials(profile.full_name, profile.nickname ?? "")}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-base font-semibold text-foreground">
              {profile.full_name}
              {profile.nickname ? ` (${profile.nickname})` : ""}
            </p>
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              {classroomLabel}
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadAvatar(file);
                  event.target.value = "";
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={uploadingAvatar}
                onClick={() => fileRef.current?.click()}
                className="gap-2 rounded-lg"
              >
                {uploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {avatarUrl ? "เปลี่ยนรูป" : "เพิ่มรูป"}
              </Button>
              {avatarUrl ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={uploadingAvatar}
                  onClick={() => void removeAvatar()}
                  className="gap-2 rounded-lg text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" /> ลบรูป
                </Button>
              ) : null}
              <Badge variant="secondary" className="h-auto rounded-md bg-sage px-2 py-1 font-normal text-sage-foreground">
                {skills.length} ทักษะ
              </Badge>
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-1.5">
          <Label htmlFor="profile-bio">เกี่ยวกับฉัน</Label>
          <Textarea
            id="profile-bio"
            rows={3}
            maxLength={240}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            placeholder="เล่าสั้น ๆ เกี่ยวกับสิ่งที่ชอบทำ และอยากเข้าทีมแบบไหน"
            className="rounded-lg"
          />
          <p className="text-xs tabular-nums text-muted-foreground">{bio.length}/240</p>
        </div>
      </AccountSection>

      <AccountSection
        id="readiness"
        title="ความพร้อมสำหรับจับคู่ทีม"
        description="เพิ่มข้อมูลให้ครบ เพื่อให้ระบบจัดอันดับงานแข่งและอาจารย์จัดทีมได้แม่นยำขึ้น"
        action={
          <span className="font-mono text-xs font-semibold tabular-nums text-primary">
            {percentage}%
          </span>
        }
      >
        <div className="space-y-3">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <ul className="grid gap-2 sm:grid-cols-2" aria-label="รายการที่ต้องทำให้ครบ">
            {checklist.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs transition-colors hover:bg-muted/50"
                >
                  <span
                    className={`flex size-5 items-center justify-center rounded-full ${
                      item.done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {item.done ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className={item.done ? "text-muted-foreground line-through" : "text-foreground"}>
                    {item.label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </AccountSection>

      <AccountSection
        id="skills"
        title="ทักษะและเครื่องมือ"
        description="เลือกทักษะที่ใช้งานได้จริง อย่างน้อย 3 รายการ"
        action={
          <span className="font-mono text-xs font-medium tabular-nums text-primary">
            เลือกแล้ว {skills.length}
          </span>
        }
      >
        <div className="space-y-5">
          {TECH_SKILL_GROUPS.map((group) => (
            <div key={group.id} className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{group.labelTh}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.skills.map((skill) => {
                  const selected = skills.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleSkill(skill)}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-xs font-medium transition-colors ${
                        selected
                          ? "border-primary/30 bg-primary/10 text-primary"
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

          <div className="space-y-2 border-t border-border pt-5">
            <Label htmlFor="custom-skill">เพิ่มทักษะอื่น</Label>
            <div className="flex gap-2">
              <Input
                id="custom-skill"
                placeholder="เช่น Rust, FastAPI, Kubernetes"
                value={customSkillInput}
                onChange={(event) => setCustomSkillInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCustomSkill();
                  }
                }}
                className="rounded-lg"
              />
              <Button type="button" variant="outline" onClick={addCustomSkill} disabled={!customSkillInput.trim()} className="rounded-lg">
                <Plus className="h-4 w-4" /> เพิ่ม
              </Button>
            </div>
            {skills.filter((skill) => !PRESET_SKILL_SET.has(skill)).length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {skills.filter((skill) => !PRESET_SKILL_SET.has(skill)).map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2.5 py-1 font-mono text-xs">
                    {tag}
                    <button type="button" onClick={() => toggleSkill(tag)} aria-label={`ลบทักษะ ${tag}`} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </AccountSection>

      <AccountSection
        id="links"
        title="ผลงานและลิงก์"
        description="เพิ่มลิงก์ไปยังโค้ดหรือผลงานที่เปิดให้ดูได้"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { id: "github", label: "ลิงก์ GitHub", value: githubUrl, set: setGithubUrl, icon: GitBranch, placeholder: "https://github.com/chื่อผู้ใช้" },
            { id: "portfolio", label: "ลิงก์ผลงาน", value: portfolioUrl, set: setPortfolioUrl, icon: ExternalLink, placeholder: "https://kaggle.com/chื่อผู้ใช้" },
            { id: "discord", label: "ลิงก์ Discord", value: discordUrl, set: setDiscordUrl, icon: Hash, placeholder: "https://discord.gg/..." },
            { id: "line", label: "ลิงก์ LINE", value: lineUrl, set: setLineUrl, icon: MessageCircle, placeholder: "https://line.me/ti/p/..." },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.id} className="space-y-1.5">
                <Label htmlFor={`link-${item.id}`} className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {item.label}
                </Label>
                <Input
                  id={`link-${item.id}`}
                  type="url"
                  value={item.value}
                  onChange={(event) => item.set(event.target.value)}
                  placeholder={item.placeholder}
                  className="rounded-lg"
                />
              </div>
            );
          })}
        </div>
      </AccountSection>

      <AccountSection
        id="contact"
        title="การติดต่อและการเปิดเผย"
        description="ช่องทางติดต่อจะแสดงเฉพาะอาจารย์และเพื่อนในทีมที่ยืนยันแล้ว"
      >
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="profile-contact" className="flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
              ช่องทางติดต่อ
            </Label>
            <Input
              id="profile-contact"
              placeholder="เช่น discord: dev_krit หรือ line: @krit"
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              className="rounded-lg"
            />
          </div>

          <label
            htmlFor="profile-directory-visible"
            className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border bg-muted/30 p-4"
          >
            <span>
              <span className="block text-sm font-medium text-foreground">
                ให้ผู้อื่นค้นพบโปรไฟล์ของฉัน
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                เมื่อเปิด ผู้อื่นจะเห็นรูปโปรไฟล์ ชื่อ ชื่อเล่น ห้องเรียน บทบาทในระบบ และทักษะของคุณในหน้าผู้คน
                อีเมล ช่องทางติดต่อ และลิงก์ส่วนตัวจะไม่แสดง
              </span>
            </span>
            <Switch
              id="profile-directory-visible"
              checked={directoryVisible}
              onCheckedChange={setDirectoryVisible}
              aria-label="ให้ผู้อื่นค้นพบโปรไฟล์ของฉัน"
            />
          </label>
        </div>
      </AccountSection>

      <div className="sticky bottom-0 z-20 -mx-4 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <p className="text-xs text-muted-foreground">
          {isDirty ? (
            <span className="font-medium text-primary">มีการแก้ไขที่ยังไม่บันทึก</span>
          ) : (
            "บันทึกแล้ว"
          )}
        </p>
        <Button type="submit" disabled={saving || !isDirty} className="gap-2 rounded-lg bg-primary text-primary-foreground">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          บันทึกโปรไฟล์
        </Button>
      </div>
    </form>
  );
}
