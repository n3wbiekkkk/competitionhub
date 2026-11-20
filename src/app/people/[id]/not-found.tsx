import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PersonNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-center">
      <p className="text-xs font-medium text-muted-foreground">ไม่พบโปรไฟล์</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        ไม่พบโปรไฟล์นี้ หรือเจ้าของยังไม่ได้เปิดเผย
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        ถ้าเป็นเพื่อนร่วมทีม ดูข้อมูลติดต่อได้จากหน้าทีมของฉันหลังอาจารย์ยืนยันแล้ว
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button asChild variant="outline" className="gap-2">
          <Link href="/people">
            <ArrowLeft className="h-4 w-4" /> กลับไปคนในสาย Tech
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/my-teams">ไปหน้าทีมของฉัน</Link>
        </Button>
      </div>
    </main>
  );
}
