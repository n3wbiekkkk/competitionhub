"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] render error", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
      <p className="text-xs font-medium text-muted-foreground">เกิดข้อผิดพลาดชั่วคราว</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        ยังไม่สามารถแสดงหน้านี้ได้
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        ข้อมูลของคุณยังอยู่ ระบบอาจเชื่อมต่อฐานข้อมูลไม่ได้ชั่วคราว กรุณาลองใหม่อีกครั้ง
        หากยังพบปัญหา กลับไปดูรายการแข่งขันได้โดยไม่ต้องเข้าสู่ระบบ
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={reset} className="gap-2">
          <RefreshCw className="h-4 w-4" /> ลองอีกครั้ง
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">กลับหน้ารายการแข่งขัน</Link>
        </Button>
      </div>
    </main>
  );
}
