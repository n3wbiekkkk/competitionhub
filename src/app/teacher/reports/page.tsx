import { redirect } from "next/navigation";
import { SchoolImpactReportView } from "@/components/reports/school-impact-report";
import { requireTeacherUser } from "@/lib/auth/cookies";
import { loadSchoolImpactReport } from "@/lib/reports/query";
import {
  getCurrentAcademicYearBe,
  parseAcademicYear,
} from "@/lib/reports/school-impact";

export const dynamic = "force-dynamic";

export default async function TeacherReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ academicYear?: string; year?: string }>;
}) {
  const auth = await requireTeacherUser();
  if (!auth.ok) redirect("/login?next=/teacher/reports");

  const params = await searchParams;
  const currentYear = getCurrentAcademicYearBe();
  const requestedYear =
    parseAcademicYear(params.academicYear ?? params.year) ?? currentYear;
  const report = await loadSchoolImpactReport({
    teacherId: auth.user.id,
    academicYear: requestedYear,
  });

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <section className="space-y-2 border-b border-border pb-6 print:hidden">
        <p className="text-xs font-medium uppercase tracking-widest text-primary">
          งานของอาจารย์ที่ปรึกษา
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          รายงานผลกระทบของโรงเรียน
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          ข้อมูลจะถูกกรองตามปีการศึกษาไทย โดยนับเฉพาะหลักฐานที่ระบบและอาจารย์รับรองแล้ว
          ส่งออกเป็น CSV เพื่อใช้ในรายงานของโรงเรียน หรือพิมพ์เป็น PDF ได้โดยตรง
        </p>
      </section>

      <div className="[&_article>section.grid]:grid-cols-1 [&_article>section.grid]:gap-5 [&_article>section.grid]:sm:grid-cols-2 [&_article>section.grid]:xl:grid-cols-4">
        <SchoolImpactReportView
          initialReport={report}
          currentYear={currentYear}
        />
      </div>
    </main>
  );
}
