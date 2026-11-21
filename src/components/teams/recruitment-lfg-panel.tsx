"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { Check, Loader2, Plus, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  isTechRole,
  TECH_ROLES,
  type TechRole,
} from "@/lib/constants/tech-taxonomy";
import {
  studentTeamsPayloadSchema,
  type StudentTeamSummary,
  type StudentTeamsPayload,
  type TeamFormationMode,
} from "@/lib/utils/teammate-match";

const MODE_LABELS: Record<TeamFormationMode, string> = {
  teacher: "จัดทีมโดยอาจารย์",
  student: "นักเรียนตั้งทีมได้",
  hybrid: "นักเรียนตั้งทีมได้ · อาจารย์ตรวจสอบ",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function messageFrom(raw: unknown, fallback: string): string {
  if (isRecord(raw) && typeof raw.error === "string" && raw.error.length > 0) {
    return raw.error;
  }
  return fallback;
}

async function readJson<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<T> {
  const raw: unknown = await response.json();
  if (!response.ok) {
    throw new Error(messageFrom(raw, "เกิดข้อผิดพลาด กรุณาลองใหม่"));
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("ข้อมูลที่ได้รับไม่ถูกต้อง กรุณารีเฟรชหน้านี้");
  }
  return parsed.data;
}

function nameFor(
  userId: string,
  payload: StudentTeamsPayload | null,
): string {
  const peer = payload?.directory_candidates.find(
    (candidate) => candidate.user_id === userId,
  );
  if (peer) {
    return `${peer.full_name}${peer.nickname ? ` (${peer.nickname})` : ""}`;
  }
  for (const team of payload?.teams ?? []) {
    const member = team.members.find((item) => item.user_id === userId);
    if (member) {
      return `${member.full_name}${member.nickname ? ` (${member.nickname})` : ""}`;
    }
  }
  return "สมาชิกในทีม";
}

function OpenRoleForm({
  teamId,
  disabled,
  onCreated,
}: {
  teamId: string;
  disabled: boolean;
  onCreated: () => Promise<void>;
}) {
  const [role, setRole] = useState<TechRole>("Backend");
  const [slots, setSlots] = useState(1);

  return (
    <form
      className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const response = await fetch(`/api/teams/${teamId}/open-roles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, slots }),
        });
        if (!response.ok) {
          const raw: unknown = await response.json();
          toast.error(messageFrom(raw, "ไม่สามารถเพิ่มตำแหน่งได้"));
          return;
        }
        toast.success("เพิ่มตำแหน่งที่เปิดรับแล้ว");
        await onCreated();
      }}
    >
      <div className="space-y-1">
        <p className="text-[11px] text-muted-foreground">บทบาทที่ต้องการ</p>
        <Select
          value={role}
          onValueChange={(value) => {
            if (isTechRole(value)) setRole(value);
          }}
        >
          <SelectTrigger className="h-8 w-44 rounded-md text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TECH_ROLES.map((item) => (
              <SelectItem key={item} value={item} className="text-xs">
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <p className="text-[11px] text-muted-foreground">จำนวนที่รับ</p>
        <Input
          type="number"
          min={1}
          max={10}
          value={slots}
          onChange={(event) => setSlots(Number(event.target.value))}
          className="h-8 w-20 rounded-md text-xs tabular-nums"
        />
      </div>
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={disabled}
        className="h-8 gap-1.5 rounded-md text-xs"
      >
        <Plus className="h-3 w-3" />
        เปิดรับตำแหน่ง
      </Button>
    </form>
  );
}

function InvitationRow({
  invitation,
  payload,
  busy,
  onRespond,
}: {
  invitation: StudentTeamsPayload["teams"][number]["invitations"][number];
  payload: StudentTeamsPayload;
  busy: boolean;
  onRespond: (id: string, action: "accept" | "decline") => Promise<void>;
}) {
  const isIncoming = invitation.recipient_id === payload.viewer.id;
  const isJoinRequest = invitation.direction === "join_request";
  const label = isJoinRequest
    ? isIncoming
      ? `${nameFor(invitation.sender_id, payload)} ขอเข้าร่วมตำแหน่ง ${invitation.role}`
      : `คุณขอเข้าร่วมตำแหน่ง ${invitation.role}`
    : isIncoming
      ? `คุณถูกเชิญเข้าตำแหน่ง ${invitation.role}`
      : `รอ ${nameFor(invitation.recipient_id, payload)} ตอบรับตำแหน่ง ${invitation.role}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-xs last:border-0">
      <span className="text-foreground/85">{label}</span>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="rounded text-[10px]">
          {invitation.status === "pending" ? "รอตอบรับ" : invitation.status}
        </Badge>
        {isIncoming && invitation.status === "pending" ? (
          <>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void onRespond(invitation.id, "accept")}
              className="h-7 gap-1 rounded-md px-2 text-[11px]"
            >
              <Check className="h-3 w-3" />
              ยืนยัน
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void onRespond(invitation.id, "decline")}
              className="h-7 gap-1 rounded-md px-2 text-[11px] text-muted-foreground"
            >
              <X className="h-3 w-3" />
              ปฏิเสธ
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function TeamBlock({
  team,
  payload,
  busy,
  onRespond,
  onRefresh,
  onRemoveRole,
}: {
  team: StudentTeamSummary;
  payload: StudentTeamsPayload;
  busy: boolean;
  onRespond: (id: string, action: "accept" | "decline") => Promise<void>;
  onRefresh: () => Promise<void>;
  onRemoveRole: (teamId: string, roleId: string) => Promise<void>;
}) {
  return (
    <div className="space-y-3 border-b border-border py-5 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">{team.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            สมาชิก{" "}
            <span className="font-mono tabular-nums">{team.members.length}</span>/
            <span className="font-mono tabular-nums">
              {payload.competition.max_size}
            </span>{" "}
            คน ·{" "}
            {team.status === "confirmed" ? "อาจารย์ยืนยันแล้ว" : "แบบร่าง"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {team.teacher_approved ? (
            <Badge variant="outline" className="rounded text-[10px]">
              อาจารย์อนุมัติแล้ว
            </Badge>
          ) : null}
          {team.recruitment_locked ? (
            <Badge variant="outline" className="rounded text-[10px]">
              ล็อกการรับสมาชิก
            </Badge>
          ) : null}
        </div>
      </div>

      {team.members.length > 0 ? (
        <div className="grid gap-x-6 sm:grid-cols-2">
          {team.members.map((member) => (
            <div
              key={member.user_id}
              className="flex items-center justify-between gap-2 border-t border-border py-2 text-xs"
            >
              <span className="text-foreground/85">
                {member.full_name}
                {member.nickname ? ` (${member.nickname})` : ""}
                {member.user_id === payload.viewer.id ? " · คุณ" : ""}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {member.assigned_role}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {team.open_roles.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">
            ตำแหน่งที่เปิดรับ
          </p>
          {team.open_roles.map((role) => (
            <div
              key={role.id}
              className="flex items-center justify-between gap-2 border-t border-border py-2 text-xs"
            >
              <span className="font-mono text-foreground/85">{role.role}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono tabular-nums text-muted-foreground">
                  {role.taken}/{role.slots} คน
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void onRemoveRole(team.id, role.id)}
                  className="h-7 rounded-md px-2 text-[11px] text-muted-foreground"
                >
                  ลบ
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!team.recruitment_locked && team.status === "draft" ? (
        <OpenRoleForm
          teamId={team.id}
          disabled={busy}
          onCreated={onRefresh}
        />
      ) : null}

      {team.invitations.length > 0 ? (
        <div className="space-y-0.5">
          <p className="text-[11px] font-medium text-muted-foreground">
            คำเชิญและคำขอเข้าทีม
          </p>
          {team.invitations.map((invitation) => (
            <InvitationRow
              key={invitation.id}
              invitation={invitation}
              payload={payload}
              busy={busy}
              onRespond={onRespond}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function RecruitmentLfgPanel({
  competitionId,
}: {
  competitionId: string;
}) {
  const [payload, setPayload] = useState<StudentTeamsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamRole, setTeamRole] = useState<TechRole>("Frontend");
  const [inviteRole, setInviteRole] = useState<TechRole>("Backend");
  const [inviteTeamId, setInviteTeamId] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/student-teams`,
        { cache: "no-store" },
      );
      const next = await readJson(response, studentTeamsPayloadSchema);
      setPayload(next);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "โหลดข้อมูลไม่สำเร็จ",
      );
    }
  }, [competitionId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function runAction(
    url: string,
    init: RequestInit,
    successMessage: string,
  ): Promise<boolean> {
    setBusy(true);
    try {
      const response = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json", ...init.headers },
      });
      const raw: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(messageFrom(raw, successMessage));
        return false;
      }
      toast.success(successMessage);
      await load();
      return true;
    } catch (actionError) {
      toast.error(
        actionError instanceof Error ? actionError.message : "เกิดข้อผิดพลาด",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function respond(invitationId: string, action: "accept" | "decline") {
    await runAction(
      `/api/invitations/${invitationId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ action }),
      },
      action === "accept" ? "ยืนยันการเข้าทีมแล้ว" : "ปฏิเสธรายการแล้ว",
    );
  }

  if (error) {
    return (
      <section className="border-y border-border py-6 text-sm text-muted-foreground">
        <p>{error}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          className="mt-3 rounded-md"
        >
          ลองใหม่
        </Button>
      </section>
    );
  }

  if (!payload) {
    return (
      <section className="flex items-center gap-2 border-y border-border py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        กำลังโหลดข้อมูลหาเพื่อนร่วมทีม
      </section>
    );
  }

  const draftTeams = payload.teams.filter(
    (team) => team.status === "draft" && !team.recruitment_locked,
  );
  const selectedTeamId =
    inviteTeamId && draftTeams.some((team) => team.id === inviteTeamId)
      ? inviteTeamId
      : (draftTeams[0]?.id ?? "");
  const ownTeamIds = new Set(payload.teams.map((team) => team.id));

  return (
    <div className="space-y-8">
      <section className="space-y-3 border-y border-border py-6">
        <div className="flex flex-wrap items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">
            หาเพื่อนร่วมทีม (LFG)
          </h2>
          <Badge variant="outline" className="rounded text-[10px]">
            {MODE_LABELS[payload.competition.team_formation_mode]}
          </Badge>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          ระบบจัดลำดับเพื่อนจากบทบาทที่ทีมยังขาด เทคโนโลยีที่ทีมยังไม่มี
          และตำแหน่งที่ทีมเปิดรับ โดยไม่ใช้ AI ในการตัดสิน
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            บทบาทที่ขาด:{" "}
            <span className="text-foreground/85">
              {payload.ranking.missing_roles.join(", ") || "ไม่มี"}
            </span>
          </span>
          <span>
            เทคโนโลยีที่ควรเสริม:{" "}
            <span className="text-foreground/85">
              {payload.ranking.missing_tech_hints.join(", ") || "ไม่มี"}
            </span>
          </span>
        </div>

        {payload.viewer.is_teacher ? (
          <p className="text-xs text-muted-foreground">
            มุมมองอาจารย์: ใช้แผงควบคุมด้านบนเพื่อตั้งโหมด อนุมัติทีม หรือล็อกการรับสมาชิก
          </p>
        ) : payload.eligible ? (
          <form
            className="flex flex-wrap items-end gap-2 border-t border-border pt-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const ok = await runAction(
                `/api/competitions/${competitionId}/student-teams`,
                {
                  method: "POST",
                  body: JSON.stringify({ name: teamName, role: teamRole }),
                },
                "สร้างทีมแบบร่างแล้ว",
              );
              if (ok) setTeamName("");
            }}
          >
            <div className="min-w-56 flex-1 space-y-1">
              <label htmlFor="lfg-team-name" className="text-[11px] text-muted-foreground">
                ชื่อทีมใหม่
              </label>
              <Input
                id="lfg-team-name"
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                placeholder="เช่น ทีมนักพัฒนา ม.5/2"
                className="h-9 rounded-md text-sm"
              />
            </div>
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground">บทบาทของคุณ</p>
              <Select
                value={teamRole}
                onValueChange={(value) => {
                  if (isTechRole(value)) setTeamRole(value);
                }}
              >
                <SelectTrigger className="h-9 w-44 rounded-md text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TECH_ROLES.map((role) => (
                    <SelectItem key={role} value={role} className="text-xs">
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              disabled={busy || teamName.trim().length < 2}
              className="h-9 gap-1.5 rounded-md text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              ตั้งทีมแบบร่าง
            </Button>
          </form>
        ) : (
          <p className="border-t border-border pt-3 text-xs text-muted-foreground">
            คุณต้องลงชื่อสนใจรายการนี้และยังไม่ได้อยู่ทีมที่ยืนยันแล้ว จึงตั้งทีมได้
          </p>
        )}
      </section>

      {payload.teams.length > 0 ? (
        <section className="space-y-1" aria-label="ทีมของฉันในรายการนี้">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground">
            ทีมที่คุณดูแล
          </h2>
          {payload.teams.map((team) => (
            <TeamBlock
              key={team.id}
              team={team}
              payload={payload}
              busy={busy}
              onRespond={respond}
              onRefresh={load}
              onRemoveRole={async (teamId, roleId) => {
                await runAction(
                  `/api/teams/${teamId}/open-roles?role_id=${encodeURIComponent(roleId)}`,
                  { method: "DELETE" },
                  "ลบตำแหน่งที่เปิดรับแล้ว",
                );
              }}
            />
          ))}
        </section>
      ) : null}

      {payload.suggestions.length > 0 ? (
        <section className="space-y-2" aria-label="เพื่อนที่แนะนำ">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground">
            เพื่อนที่ควรชวน (#{
            <span className="font-mono tabular-nums">
              {payload.suggestions.length}
            </span>
            })
          </h2>
          <div className="divide-y divide-border border-y border-border">
            {payload.suggestions.map((suggestion) => (
              <div key={suggestion.candidate.user_id} className="space-y-2 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {suggestion.candidate.full_name}
                      {suggestion.candidate.nickname
                        ? ` (${suggestion.candidate.nickname})`
                        : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {suggestion.candidate.preferred_role ?? "ยังไม่ระบุบทบาท"}
                      {suggestion.candidate.grade
                        ? ` · ${suggestion.candidate.grade}`
                        : ""}
                    </p>
                  </div>
                  <span className="font-mono text-xs tabular-nums text-primary">
                    {suggestion.score}/100
                  </span>
                </div>
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {suggestion.reasons.map((reason) => (
                    <li key={reason}>· {reason}</li>
                  ))}
                </ul>
                {draftTeams.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Select
                      value={inviteRole}
                      onValueChange={(value) => {
                        if (isTechRole(value)) setInviteRole(value);
                      }}
                    >
                      <SelectTrigger className="h-8 w-40 rounded-md text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TECH_ROLES.map((role) => (
                          <SelectItem key={role} value={role} className="text-xs">
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={async () => {
                        await runAction(
                          `/api/teams/${selectedTeamId}/invitations`,
                          {
                            method: "POST",
                            body: JSON.stringify({
                              target_user_id: suggestion.candidate.user_id,
                              role: inviteRole,
                            }),
                          },
                          "ส่งคำเชิญแล้ว",
                        );
                      }}
                      className="h-8 gap-1.5 rounded-md text-xs"
                    >
                      <UserPlus className="h-3 w-3" />
                      เชิญเข้าทีม
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {draftTeams.length > 1 ? (
            <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
              ทีมที่ส่งคำเชิญ:
              <Select
                value={selectedTeamId}
                onValueChange={setInviteTeamId}
              >
                <SelectTrigger className="h-8 w-56 rounded-md text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {draftTeams.map((team) => (
                    <SelectItem key={team.id} value={team.id} className="text-xs">
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-2" aria-label="ตำแหน่งที่เปิดรับ">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground">
          ตำแหน่งที่เปิดรับจากทีมอื่น
        </h2>
        {payload.open_roles.filter((role) => !ownTeamIds.has(role.team_id))
          .length === 0 ? (
          <p className="border-y border-border py-5 text-xs text-muted-foreground">
            ยังไม่มีทีมไหนเปิดรับสมาชิกเพิ่มในขณะนี้
          </p>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {payload.open_roles
              .filter((role) => !ownTeamIds.has(role.team_id))
              .map((role) => (
                <div
                  key={role.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {role.team_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ต้องการ {role.role} ·{" "}
                      <span className="font-mono tabular-nums">
                        {Math.max(0, role.slots - role.taken)}
                      </span>{" "}
                      ที่ว่าง
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || !payload.eligible}
                    onClick={async () => {
                      await runAction(
                        `/api/teams/${role.team_id}/open-roles/${role.id}/requests`,
                        { method: "POST", body: JSON.stringify({}) },
                        "ส่งคำขอเข้าทีมแล้ว",
                      );
                    }}
                    className="h-8 rounded-md text-xs"
                  >
                    ขอเข้าร่วม
                  </Button>
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}
