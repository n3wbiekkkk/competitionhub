"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { CompetitionStatus } from "@/lib/constants/tech-taxonomy";

interface TeacherQuickStatusButtonProps {
  competitionId: string;
  currentStatus: CompetitionStatus;
}

export function TeacherQuickStatusButton({
  competitionId,
  currentStatus,
}: TeacherQuickStatusButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (currentStatus !== "open" && currentStatus !== "closed") {
    return null;
  }

  const nextStatus: CompetitionStatus =
    currentStatus === "open" ? "closed" : "open";

  async function handleToggle() {
    setLoading(true);
    try {
      const res = await fetch(`/api/competitions/${competitionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        toast.error(data.error ?? "ไม่สามารถเปลี่ยนสถานะรายการได้");
        return;
      }
      toast.success(
        nextStatus === "closed"
          ? "เปลี่ยนสถานะเป็นปิดรับสมัครแล้ว"
          : "เปิดรับสมัครรายการนี้อีกครั้งแล้ว",
      );
      router.refresh();
    } catch {
      toast.error("เกิดข้อผิดพลาดในการอัปเดตสถานะ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={loading}
      onClick={handleToggle}
      className="gap-1.5"
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : currentStatus === "open" ? (
        <Lock className="h-3.5 w-3.5" />
      ) : (
        <LockOpen className="h-3.5 w-3.5" />
      )}
      {currentStatus === "open" ? "ปิดรับสมัคร" : "เปิดรับอีกครั้ง"}
    </Button>
  );
}
