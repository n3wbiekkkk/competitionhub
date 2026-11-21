"use client";

import { useEffect, useState } from "react";
import { Bookmark, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CompetitionBookmarkButton({
  competitionId,
}: {
  competitionId: string;
}) {
  const [bookmarked, setBookmarked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(
          `/api/competitions/${competitionId}/bookmark`,
        );
        if (!response.ok) return;
        const data = (await response.json()) as { bookmarked: boolean };
        setBookmarked(data.bookmarked);
      } catch {
        // Keep the rail usable when bookmark state cannot be loaded.
      }
    })();
  }, [competitionId]);

  async function toggleBookmark() {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/bookmark`,
        {
          method: bookmarked ? "DELETE" : "POST",
        },
      );
      if (!response.ok) throw new Error("bookmark failed");
      setBookmarked(!bookmarked);
      toast.success(
        bookmarked ? "ลบรายการที่บันทึกแล้ว" : "บันทึกการแข่งขันแล้ว",
      );
    } catch {
      toast.error("ไม่สามารถบันทึกได้");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant={bookmarked ? "secondary" : "outline"}
      onClick={() => void toggleBookmark()}
      disabled={busy}
      aria-pressed={bookmarked}
      className="w-full gap-2 rounded-md"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Bookmark className="h-4 w-4" />
      )}
      {bookmarked ? "บันทึกแล้ว" : "บันทึกไว้"}
    </Button>
  );
}
