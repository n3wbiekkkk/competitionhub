"use client";

import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { parseSafeSegments, type SafeSegment } from "@/lib/realtime/markdown";
import type { MentionableMember, RealtimeEvent, TeamMessageItem } from "@/lib/realtime/types";
import { useLiveUpdates } from "./use-live-updates";

export interface TeamChatProps {
  teamId: string;
  currentUserId: string;
  members: readonly MentionableMember[];
  initialMessages?: TeamMessageItem[];
  enabled?: boolean;
}

const timeFormatter = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  hour: "2-digit",
  minute: "2-digit",
});

function mergeMessages(current: TeamMessageItem[], incoming: TeamMessageItem[]): TeamMessageItem[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function RenderedBody({
  body,
  members,
  currentUserId,
}: {
  body: string;
  members: readonly MentionableMember[];
  currentUserId: string;
}) {
  const segments: SafeSegment[] = parseSafeSegments(body, members);
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
      {segments.map((segment, index) => {
        if (segment.kind === "link") {
          return (
            <a
              key={index}
              href={segment.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-primary underline underline-offset-2"
            >
              {segment.text}
            </a>
          );
        }
        if (segment.kind === "mention") {
          return (
            <span
              key={index}
              className={
                segment.userId === currentUserId
                  ? "rounded bg-primary/10 px-1 font-medium text-primary"
                  : "font-medium text-primary"
              }
            >
              {segment.text}
            </span>
          );
        }
        return <span key={index}>{segment.text}</span>;
      })}
    </p>
  );
}

export function TeamChat({
  teamId,
  currentUserId,
  members,
  initialMessages,
  enabled = true,
}: TeamChatProps) {
  const [messages, setMessages] = useState<TeamMessageItem[]>(initialMessages ?? []);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const loadMessages = useCallback(async () => {
    try {
      const response = await fetch(`/api/teams/${teamId}/messages`, { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { messages: TeamMessageItem[] };
      setMessages((prev) => mergeMessages(prev, data.messages));
    } catch {
      // Keep the last loaded conversation visible.
    }
  }, [teamId]);

  useEffect(() => {
    if (initialMessages !== undefined) return;
    void (async () => {
      try {
        const response = await fetch(`/api/teams/${teamId}/messages`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { messages: TeamMessageItem[] };
        setMessages((prev) => mergeMessages(prev, data.messages));
      } catch {
        // Keep the last loaded conversation visible.
      }
    })();
  }, [initialMessages, teamId]);

  const handleEvent = useCallback(
    (event: RealtimeEvent) => {
      if (event.kind === "team_message" && event.teamId === teamId) void loadMessages();
    },
    [loadMessages, teamId],
  );

  useLiveUpdates({ enabled, onEvent: handleEvent });

  function insertMention(member: MentionableMember) {
    const label = member.nickname ?? member.fullName;
    setDraft((prev) => `${prev}${prev && !prev.endsWith(" ") ? " " : ""}@${label} `);
  }

  async function sendMessage() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const response = await fetch(`/api/teams/${teamId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = (await response.json()) as { message?: TeamMessageItem; error?: string };
      const message = data.message;
      if (!response.ok || !message) {
        throw new Error(data.error ?? "ไม่สามารถส่งข้อความได้");
      }
      setMessages((prev) => mergeMessages(prev, [message]));
      setDraft("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ไม่สามารถส่งข้อความได้");
    } finally {
      setSending(false);
    }
  }

  return (
    <section id={`team-${teamId}`} className="space-y-4 border-t border-border pt-6" aria-label="แชททีม">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">แชททีม</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            ใช้ @ชื่อเล่นเพื่อเรียกเพื่อนร่วมทีม ลิงก์ http(s) จะแสดงเป็นลิงก์ที่ปลอดภัย
          </p>
        </div>
        <Badge variant="outline" className="font-mono text-[10px] tabular-nums">
          {messages.length}
        </Badge>
      </div>

      <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            ยังไม่มีข้อความ เริ่มสนทนากับทีมได้เลย
          </p>
        ) : null}
        {messages.map((message) => (
          <article key={message.id} className="border-b border-border pb-3 last:border-b-0">
            <div className="mb-1 flex items-baseline gap-2">
              <span className="text-xs font-medium text-foreground">
                {message.authorName}
                {message.nickname ? ` (${message.nickname})` : ""}
              </span>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {timeFormatter.format(new Date(message.createdAt))}
              </span>
              {message.authorId === currentUserId ? (
                <span className="text-[10px] text-muted-foreground">(คุณ)</span>
              ) : null}
            </div>
            <RenderedBody
              body={message.body}
              members={members}
              currentUserId={currentUserId}
            />
          </article>
        ))}
      </div>

      {members.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {members
            .filter((member) => member.id !== currentUserId)
            .slice(0, 10)
            .map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => insertMention(member)}
                className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary"
              >
                @{member.nickname ?? member.fullName}
              </button>
            ))}
        </div>
      ) : null}

      <div className="space-y-2">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="พิมพ์ข้อความถึงทีม…"
          maxLength={2000}
          rows={2}
          aria-label="ข้อความแชททีม"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {draft.length}/2000
          </span>
          <Button size="sm" onClick={() => void sendMessage()} disabled={!draft.trim() || sending}>
            <Send className="mr-1.5 h-3.5 w-3.5" />
            {sending ? "กำลังส่ง" : "ส่งข้อความ"}
          </Button>
        </div>
      </div>
    </section>
  );
}
