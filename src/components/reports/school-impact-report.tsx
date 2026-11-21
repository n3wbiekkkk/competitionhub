"use client";

import { useRef, useState } from "react";
import { Download, Printer } from "lucide-react";
import {
  formatThaiDate,
  getTodayIsoBangkok,
} from "@/lib/utils/thai-date";
import { schoolCategoryLabelTh } from "@/lib/reports/school-impact";
import {
  schoolImpactResponseSchema,
  type SchoolImpactReport,
} from "@/lib/reports/types";
import styles from "@/components/reports/school-impact-report.module.css";

const METRIC_LABELS = [
  { key: "students", label: "นักเรียนที่เข้าร่วมกิจกรรม" },
  { key: "interests", label: "รายการความสนใจ" },
  { key: "confirmedTeams", label: "ทีมที่ได้รับการยืนยัน" },
  { key: "verifiedAwards", label: "รางวัลที่รับรองแล้ว" },
  { key: "skillEvidence", label: "หลักฐานทักษะที่รับรองแล้ว" },
  { key: "completedTasks", label: "งานในทีมที่เสร็จแล้ว" },
  { key: "badgesAwarded", label: "ตราเกียรติยศที่ได้รับ" },
] as const satisfies readonly {
  key: keyof SchoolImpactReport["totals"];
  label: string;
}[];

export function SchoolImpactReportView({
  initialReport,
  currentYear,
}: {
  initialReport: SchoolImpactReport;
  currentYear: number;
}) {
  const [academicYear, setAcademicYear] = useState(initialReport.academicYear);
  const [report, setReport] = useState(initialReport);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const years = Array.from(
    { length: 5 },
    (_, index) => currentYear + 1 - index,
  );

  async function changeYear(nextYear: number) {
    setAcademicYear(nextYear);
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/teacher/reports/school-impact?academicYear=${nextYear}`,
        { headers: { Accept: "application/json" } },
      );
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "ไม่สามารถโหลดรายงานได้";
        throw new Error(message);
      }
      const parsed = schoolImpactResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error("รูปแบบข้อมูลรายงานไม่ถูกต้อง");
      }
      if (currentRequest === requestId.current) setReport(parsed.data.report);
    } catch (cause) {
      if (currentRequest === requestId.current) {
        setError(
          cause instanceof Error ? cause.message : "ไม่สามารถโหลดรายงานได้",
        );
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className={`${styles.toolbar} print:hidden`}>
        <div className="space-y-2">
          <label
            htmlFor="academic-year"
            className="block text-xs font-medium uppercase tracking-widest text-muted-foreground"
          >
            ปีการศึกษา (พ.ศ.)
          </label>
          <select
            id="academic-year"
            value={academicYear}
            onChange={(event) => void changeYear(Number(event.target.value))}
            className="h-10 rounded-lg border border-border bg-background px-3 font-mono text-sm tabular-nums text-foreground"
          >
            {years.map((year) => (
              <option key={year} value={year}>
                ปีการศึกษา {year}
              </option>
            ))}
          </select>
          <p aria-live="polite" className="text-xs text-muted-foreground">
            {loading ? "กำลังสรุปข้อมูล..." : report.periodTh}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/teacher/reports/school-impact/export?academicYear=${academicYear}`}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            ส่งออก CSV
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-foreground px-3 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            พิมพ์ / บันทึก PDF
          </button>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <article className={styles.sheet} aria-busy={loading}>
        <header className="space-y-1 border-b border-border pb-5">
          <p className="text-xs font-medium uppercase tracking-widest text-primary">
            สรุปผลกระทบด้านการเรียนรู้
          </p>
          <h2 className="text-xl font-semibold text-foreground">
            รายงานผลกระทบของโรงเรียน {report.academicYearLabel}
          </h2>
          <p className="text-sm leading-[1.65] text-muted-foreground">
            {report.periodTh} · สร้างเมื่อ{" "}
            {formatThaiDate(getTodayIsoBangkok(new Date(report.generatedAt)), "long")}
          </p>
        </header>

        <section className="grid gap-x-8 gap-y-4 border-b border-border py-6 sm:grid-cols-2 lg:grid-cols-3">
          {METRIC_LABELS.map((metric) => (
            <div key={metric.key} className="space-y-1">
              <p className="text-xs text-muted-foreground">{metric.label}</p>
              <p className="font-mono text-xl tabular-nums text-foreground">
                {report.totals[metric.key]}
              </p>
            </div>
          ))}
        </section>

        <section className="space-y-3 border-b border-border py-6">
          <h3 className="text-sm font-semibold text-foreground">
            สรุปตามหมวดการแข่งขัน
          </h3>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">หมวด</th>
                  <th scope="col">ความสนใจ</th>
                  <th scope="col">ทีมที่ยืนยัน</th>
                  <th scope="col">รางวัลรับรอง</th>
                </tr>
              </thead>
              <tbody>
                {report.byCategory.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-muted-foreground">
                      ไม่มีข้อมูลในปีการศึกษานี้
                    </td>
                  </tr>
                ) : (
                  report.byCategory.map((row) => (
                    <tr key={row.category}>
                      <td>{schoolCategoryLabelTh(row.category)}</td>
                      <td className="font-mono tabular-nums">{row.interests}</td>
                      <td className="font-mono tabular-nums">
                        {row.confirmedTeams}
                      </td>
                      <td className="font-mono tabular-nums">
                        {row.verifiedAwards}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3 border-b border-border py-6">
          <h3 className="text-sm font-semibold text-foreground">
            สรุปตามระดับชั้น
          </h3>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">ระดับชั้น</th>
                  <th scope="col">นักเรียนที่เข้าร่วม</th>
                  <th scope="col">ความสนใจ</th>
                  <th scope="col">รางวัลรับรอง</th>
                </tr>
              </thead>
              <tbody>
                {report.byGrade.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-muted-foreground">
                      ไม่มีข้อมูลในปีการศึกษานี้
                    </td>
                  </tr>
                ) : (
                  report.byGrade.map((row) => (
                    <tr key={row.grade}>
                      <td className="font-mono">{row.grade}</td>
                      <td className="font-mono tabular-nums">{row.students}</td>
                      <td className="font-mono tabular-nums">{row.interests}</td>
                      <td className="font-mono tabular-nums">
                        {row.verifiedAwards}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3 py-6">
          <h3 className="text-sm font-semibold text-foreground">
            ทักษะที่มีหลักฐานรับรองมากที่สุด
          </h3>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">ทักษะหรือบทบาท</th>
                  <th scope="col">จำนวนหลักฐาน</th>
                  <th scope="col">จำนวนนักเรียน</th>
                </tr>
              </thead>
              <tbody>
                {report.topSkills.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-muted-foreground">
                      ยังไม่มีหลักฐานทักษะที่รับรองแล้ว
                    </td>
                  </tr>
                ) : (
                  report.topSkills.map((row) => (
                    <tr key={row.skill}>
                      <td className="font-mono">{row.skill}</td>
                      <td className="font-mono tabular-nums">
                        {row.evidenceCount}
                      </td>
                      <td className="font-mono tabular-nums">
                        {row.studentCount}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </article>
    </div>
  );
}
