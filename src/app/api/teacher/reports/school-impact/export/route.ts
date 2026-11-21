import { NextResponse } from "next/server";
import { requireTeacherUser } from "@/lib/auth/cookies";
import { loadSchoolImpactReport } from "@/lib/reports/query";
import {
  getCurrentAcademicYearBe,
  parseAcademicYear,
  schoolImpactReportToCsv,
} from "@/lib/reports/school-impact";
import { logError } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireTeacherUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const rawYear =
    searchParams.get("academicYear") ??
    searchParams.get("year") ??
    getCurrentAcademicYearBe();
  const academicYear = parseAcademicYear(rawYear);
  if (academicYear === null) {
    return NextResponse.json(
      { error: "ปีการศึกษาไม่ถูกต้อง กรุณาใช้ปี พ.ศ. เช่น 2569" },
      { status: 400 },
    );
  }

  try {
    const report = await loadSchoolImpactReport({
      teacherId: auth.user.id,
      academicYear,
    });
    const csv = schoolImpactReportToCsv(report);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="school-impact-${academicYear}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logError("[api/teacher/reports/school-impact/export] GET error:", error);
    return NextResponse.json(
      { error: "ไม่สามารถส่งออกข้อมูลรายงานเป็น CSV ได้" },
      { status: 500 },
    );
  }
}
