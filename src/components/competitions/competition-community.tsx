"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Bookmark, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatThaiDate } from "@/lib/utils/thai-date";
import type { CompetitionComment } from "@/types/database";

export function CompetitionCommunity({ competitionId }: { competitionId: string }) {
  const [bookmarked, setBookmarked] = useState(false);
  const [comments, setComments] = useState<CompetitionComment[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [b, c] = await Promise.all([
          fetch(`/api/competitions/${competitionId}/bookmark`),
          fetch(`/api/competitions/${competitionId}/comments`),
        ]);
        if (b.ok) {
          const data = (await b.json()) as { bookmarked: boolean };
          setBookmarked(data.bookmarked);
        }
        if (c.ok) {
          const data = (await c.json()) as { comments: CompetitionComment[] };
          setComments(data.comments);
        }
      } catch {
        // Keep the section usable without live data.
      }
    })();
  }, [competitionId]);

  async function toggleBookmark() {
    setBusy(true);
    try {
      const response = await fetch(`/api/competitions/${competitionId}/bookmark`, {
        method: bookmarked ? "DELETE" : "POST",
      });
      if (!response.ok) throw new Error("bookmark failed");
      setBookmarked(!bookmarked);
      toast.success(bookmarked ? "ลบรายการที่บันทึกแล้ว" : "บันทึกการแข่งขันแล้ว");
    } catch {
      toast.error("ไม่สามารถบันทึกได้");
    } finally {
      setBusy(false);
    }
  }

  async function submitComment(event: FormEvent) {
    event.preventDefault();
    if (body.trim().length < 2) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/competitions/${competitionId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!response.ok) throw new Error("comment failed");
      const data = (await response.json()) as { comment: CompetitionComment };
      setComments((prev) => [...prev, data.comment]);
      setBody("");
      toast.success("โพสต์แล้ว");
    } catch {
      toast.error("ไม่สามารถโพสต์ได้");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5 border-t border-border pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">ติดตามและสอบถาม</h2>
          <p className="text-xs text-muted-foreground">บันทึกไว้ดูซ้ำ หรือถามอาจารย์และเพื่อนในรายการนี้</p>
        </div>
        <Button
          type="button"
          variant={bookmarked ? "secondary" : "outline"}
          onClick={() => void toggleBookmark()}
          disabled={busy}
          className="gap-2 rounded-lg"
        >
          <Bookmark className="h-4 w-4" />
          {bookmarked ? "บันทึกแล้ว" : "บันทึกไว้"}
        </Button>
      </div>

      <ul className="space-y-3">
        {comments.map((comment) => (
          <li key={comment.id} className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              {comment.is_pinned ? (
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">ปักหมุด</span>
              ) : null}
              {comment.is_official ? (
                <span className="rounded-md bg-sage px-2 py-0.5 text-[11px] font-medium text-sage-foreground">อาจารย์</span>
              ) : null}
              <span className="text-xs text-muted-foreground">
                {formatThaiDate(comment.created_at.slice(0, 10), "short")}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/85">{comment.body}</p>
          </li>
        ))}
      </ul>

      <form onSubmit={submitComment} className="space-y-2">
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="ถามเกี่ยวกับรายการแข่งขัน หรือแจ้งข้อมูลที่อาจารย์ควรทราบ"
          className="rounded-lg"
        />
        <Button type="submit" disabled={busy || body.trim().length < 2} className="gap-2 rounded-lg">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
          โพสต์คำถาม
        </Button>
      </form>
    </section>
  );
}
