import { redirect } from "next/navigation";
import { Code2 } from "lucide-react";
import { AuthForm } from "@/components/auth/auth-form";
import { getAuthenticatedProfile } from "@/lib/auth/cookies";
import { withUserDb } from "@/lib/db/pool";
import { isSafeInternalRedirect } from "@/lib/utils/url-safety";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; mode?: string; error?: string }>;
}) {
  const [user, params] = await Promise.all([
    getAuthenticatedProfile(),
    searchParams,
  ]);
  const nextUrl = isSafeInternalRedirect(params.next);

  if (user) {
    redirect(nextUrl);
  }

  let openCount = 0;
  let totalCount = 0;
  try {
    const counts = await withUserDb(null, async (client) => {
      const res = await client.query<{
        open_count: string;
        total_count: string;
      }>(
        `SELECT count(*) FILTER (WHERE status = 'open')::text AS open_count,
                count(*) FILTER (WHERE status IN ('open', 'closed'))::text AS total_count
         FROM public.competitions`,
      );
      return {
        open: Number(res.rows[0]?.open_count ?? 0),
        total: Number(res.rows[0]?.total_count ?? 0),
      };
    });
    openCount = counts.open;
    totalCount = counts.total;
  } catch {
    openCount = 0;
    totalCount = 0;
  }

  const initialTab = params.mode === "register" ? "register" : "login";

  return (
    <main className="mx-auto grid min-h-[calc(100vh-8rem)] max-w-5xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-12 lg:px-8">
      {/* Left Context Panel */}
      <section className="space-y-6 lg:col-span-5 lg:border-r lg:border-border lg:pr-10">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-background">
            <Code2 className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-foreground">
            TechComp Hub
          </span>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold leading-snug tracking-tight text-foreground">
            ศูนย์รวมการแข่งขันสายเทคโนโลยีและจัดทีมนักเรียน
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            สมัครสมาชิกพร้อมระบุชั้นและห้องเรียนเพื่อลงชื่อเข้าร่วมแข่งขัน
            จับคู่งานที่ตรงกับทักษะ และตรวจสอบรายชื่อทีมกับอาจารย์ที่ปรึกษา
          </p>
        </div>

        <dl className="divide-y divide-border border-y border-border text-xs">
          <div className="flex items-center justify-between py-2.5">
            <dt className="text-muted-foreground">ฐานข้อมูลงานแข่งในไทย</dt>
            <dd className="font-mono font-semibold tabular-nums text-foreground">
              {totalCount} รายการ
            </dd>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <dt className="text-muted-foreground">กำลังเปิดรับสมัคร</dt>
            <dd className="font-mono font-semibold tabular-nums text-primary">
              {openCount} รายการ
            </dd>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <dt className="text-muted-foreground">รองรับระดับชั้น</dt>
            <dd className="font-medium text-foreground">ม.1–ม.6 · ห้อง 1–14</dd>
          </div>
        </dl>

        <ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">
          <li>· จับคู่งานแข่งที่ตรงกับภาษาและเครื่องมือในโปรไฟล์อัตโนมัติ</li>
          <li>· ส่งออกกำหนดปิดรับสมัครลงปฏิทิน (.ics) พร้อมแจ้งเตือนล่วงหน้า</li>
          <li>· อาจารย์จัดทีมและตรวจสอบความครอบคลุมบทบาทได้ในบอร์ดเดียว</li>
        </ul>
      </section>

      {/* Right Auth Form */}
      <section className="lg:col-span-7 lg:pl-2">
        <div className="mx-auto w-full max-w-md lg:mx-0">
          <AuthForm nextUrl={nextUrl} initialTab={initialTab} error={params.error} />
        </div>
      </section>
    </main>
  );
}
