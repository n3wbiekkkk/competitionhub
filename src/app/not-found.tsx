import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-2xl flex-col items-start justify-center px-4 py-16 sm:px-6">
      <p className="font-mono text-xs font-medium tracking-wide text-muted-foreground">
        404
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        ไม่พบหน้าที่คุณต้องการ
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        ลิงก์นี้อาจถูกลบ เปลี่ยนที่อยู่ หรือคุณไม่มีสิทธิ์เข้าถึงรายการแข่งขันที่ยังไม่อนุมัติ
      </p>
      <div className="mt-6">
        <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-md">
          <Link href="/">
            <ArrowLeft className="h-3.5 w-3.5" />
            กลับไปหน้ารายการแข่งขัน
          </Link>
        </Button>
      </div>
    </main>
  );
}
