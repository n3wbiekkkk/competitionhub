"use client";

import { AccountSection } from "@/components/account/account-section";
import type { OpsTelemetrySnapshot } from "@/lib/ops/telemetry";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex] ?? "B"}`;
}

function formatUtc(iso: string): string {
  return `${iso.slice(0, 16).replace("T", " ")} UTC`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-border py-2 last:border-b-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

export function OpsTelemetryPanel({
  snapshot,
}: {
  snapshot: OpsTelemetrySnapshot;
}) {
  return (
    <div className="space-y-10">
      <AccountSection
        title="ภาพรวมฐานข้อมูล"
        description={`ขนาดตารางรวมดัชนี วัดจาก pg_total_relation_size เมื่อ ${formatUtc(snapshot.generatedAt)}`}
      >
        <div className="overflow-x-auto border-y border-border">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th scope="col" className="py-2 pr-4 font-medium">ตาราง</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">จำนวนแถว</th>
                <th scope="col" className="py-2 text-right font-medium">ขนาดรวม</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.tables.map((table) => (
                <tr key={table.name} className="border-b border-border last:border-b-0">
                  <td className="py-2 pr-4 font-mono text-foreground">{table.name}</td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums text-foreground">
                    {table.rows.toLocaleString("en-US")}
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums text-muted-foreground">
                    {formatBytes(table.bytes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AccountSection>

      <AccountSection
        title="คิวอีเมล"
        description="จำนวนงานในแต่ละสถานะจาก email_outbox"
      >
        <dl className="border-y border-border">
          {snapshot.outbox.map((bucket) => (
            <Metric key={bucket.status} label={bucket.status} value={bucket.count.toLocaleString("en-US")} />
          ))}
        </dl>
      </AccountSection>

      <AccountSection
        title="ผลการค้นหา AI 30 วัน"
        description="ผลผลิตจาก scout_runs และสุขภาพของแต่ละต้นทาง"
      >
        <dl className="border-y border-border">
          <Metric label="รอบที่รัน" value={snapshot.scout.runs.toLocaleString("en-US")} />
          <Metric label="พบลิงก์" value={snapshot.scout.found.toLocaleString("en-US")} />
          <Metric label="บันทึกใหม่" value={snapshot.scout.inserted.toLocaleString("en-US")} />
          <Metric label="ซ้ำ" value={snapshot.scout.duplicates.toLocaleString("en-US")} />
          <Metric label="รอบล้มเหลว" value={snapshot.scout.failedRuns.toLocaleString("en-US")} />
        </dl>
        <div className="mt-4 overflow-x-auto border-y border-border">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th scope="col" className="py-2 pr-4 font-medium">ต้นทาง</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">รอบ</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">พบ</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">ใหม่</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">ล้มเหลว</th>
                <th scope="col" className="py-2 text-right font-medium">สถานะล่าสุด</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.scout.sources.map((source) => (
                <tr key={source.name} className="border-b border-border last:border-b-0">
                  <td className="py-2 pr-4 font-mono text-foreground">{source.name}</td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums text-foreground">{source.runs}</td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums text-foreground">{source.found}</td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums text-foreground">{source.inserted}</td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums text-foreground">{source.failed}</td>
                  <td className="py-2 text-right text-xs text-muted-foreground">
                    {source.lastStatus ?? "-"}
                    {source.consecutiveFailures > 0
                      ? ` · ติดต่อกัน ${source.consecutiveFailures} ครั้ง`
                      : ""}
                  </td>
                </tr>
              ))}
              {snapshot.scout.sources.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4 text-muted-foreground">ยังไม่มีข้อมูลต้นทางใน 30 วันนี้</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </AccountSection>

      <AccountSection
        title="AI latency และ error"
        description={`นับจาก audit_logs.action = ai.request ใน ${snapshot.ai.windowHours} ชั่วโมงล่าสุด`}
      >
        <dl className="border-y border-border">
          <Metric label="คำขอ" value={snapshot.ai.requests.toLocaleString("en-US")} />
          <Metric label="ล้มเหลว" value={snapshot.ai.errors.toLocaleString("en-US")} />
          <Metric
            label="latency เฉลี่ย"
            value={snapshot.ai.avgLatencyMs === null ? "-" : `${snapshot.ai.avgLatencyMs} ms`}
          />
          <Metric
            label="latency p95"
            value={snapshot.ai.p95LatencyMs === null ? "-" : `${snapshot.ai.p95LatencyMs} ms`}
          />
        </dl>
        {!snapshot.ai.instrumented ? (
          <p className="pt-3 text-xs leading-relaxed text-muted-foreground">
            ยังไม่มีเส้นทาง AI ที่บันทึกตัวเลขนี้ ต้องเรียก recordAiCall จาก route ของ AI ก่อนจึงจะมีข้อมูล
          </p>
        ) : null}
      </AccountSection>

      <AccountSection
        title="SSE และ rate limit"
        description="จำนวนการเชื่อมต่อแบบ stream และสถานะ bucket ปัจจุบัน"
      >
        <dl className="border-y border-border">
          <Metric
            label="SSE ที่เปิดอยู่ (เฉพาะ process นี้)"
            value={snapshot.realtime.activeSseStreams.toLocaleString("en-US")}
          />
          <Metric
            label="bucket ที่ยังไม่หมดอายุ"
            value={snapshot.realtime.rateLimitBucketsActive.toLocaleString("en-US")}
          />
          <Metric
            label="การชน bucket ใน 1 ชั่วโมง"
            value={snapshot.realtime.rateLimitHitsLastHour.toLocaleString("en-US")}
          />
        </dl>
      </AccountSection>
    </div>
  );
}
