"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Loader2,
  RotateCcw,
  Search,
  Users,
  WandSparkles,
} from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import type { DiscoveryApiResponse, DiscoveryResultItem } from "@/types/discovery";
import { formatThaiDate } from "@/lib/utils/thai-date";
import { getCategoryIcon } from "@/components/competitions/category-icon";
import { TECH_CATEGORY_META } from "@/lib/constants/tech-taxonomy";

const apiSchema = z.object({
  mode: z.enum(["ai", "fallback"]),
  results: z.array(z.object({
    competition: z.object({
      id: z.string().uuid(),
      title: z.string(),
      category: z.enum(["Programming / Competitive", "AI & Data Science", "Web & Mobile Dev", "Cybersecurity / CTF", "Robotics & IoT", "Game Dev", "Tech Hackathon & Innovation", "UI/UX & Digital Design"]),
      deadline: z.string().nullable(),
      min_size: z.number(),
      max_size: z.number(),
      recommended_roles: z.array(z.string()),
      tech_stack_hints: z.array(z.string()),
      eligibility: z.string().nullable(),
      summary: z.string().nullable(),
      source_url: z.string().nullable(),
      source_type: z.enum(["ai_auto", "ai_link", "ai_poster", "manual"]),
      status: z.enum(["pending_review", "open", "closed", "rejected"]),
      created_by: z.string().nullable(),
      created_at: z.string(),
      updated_at: z.string(),
    }),
    reasons: z.array(z.string()),
  })),
  message: z.string().optional(),
}) satisfies z.ZodType<DiscoveryApiResponse>;

interface AiDiscoveryPanelProps {
  userSkills: string[];
}

export function AiDiscoveryPanel({ userSkills }: AiDiscoveryPanelProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiscoveryResultItem[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setResult(null);
    setMessage(null);

    try {
      const response = await fetch("/api/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const detail = z.object({ error: z.string() }).safeParse(body);
        throw new Error(detail.success ? detail.data.error : "ค้นหาไม่สำเร็จ กรุณาลองใหม่");
      }
      const parsed = apiSchema.safeParse(body);
      if (!parsed.success) throw new Error("ข้อมูลผลการค้นหาไม่ถูกต้อง");
      setResult(parsed.data.results);
      setMessage(parsed.data.message ?? null);
      if (parsed.data.results.length === 0) {
        setMessage("ยังไม่พบรายการที่ตรงเงื่อนไข ลองเปลี่ยนสายงานหรือจำนวนสมาชิกดูนะ");
      }
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") return;
      setError(requestError instanceof Error ? requestError.message : "ค้นหาไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }

  return (
    <section className="rounded-[1.25rem] border border-primary/15 bg-card p-4 shadow-[0_8px_30px_-22px_var(--foreground)] sm:p-6" aria-labelledby="ai-discovery-heading">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-primary">
            <WandSparkles className="h-4 w-4" aria-hidden="true" />
            <span>ค้นหาด้วย AI จากรายการจริงในระบบ</span>
          </div>
          <h2 id="ai-discovery-heading" className="text-xl font-semibold tracking-tight">อยากแข่งอะไร? บอกเราได้เลย</h2>
          <p className="text-sm text-muted-foreground">เช่น “อยากแข่ง AI หุ่นยนต์ ทีม 3 คน” เราช่วยหางานที่ใช่ พร้อมบอกเหตุผลให้</p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs" aria-label="ตัวอย่างคำค้นหา">
          {[
            "แข่งหุ่นยนต์สำหรับนักเรียน",
            "AI ที่ทำทีม 3 คนได้",
            "Hackathon น่าไป",
          ].map((example) => (
            <button key={example} type="button" onClick={() => setQuery(example)} className="rounded-full border border-primary/15 bg-sage px-3 py-1.5 text-sage-foreground transition-colors hover:bg-sage/70">
              {example}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-2.5 sm:flex-row">
        <label htmlFor="ai-discovery-query" className="sr-only">สายงานหรือทักษะที่อยากแข่ง</label>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="ai-discovery-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={300}
            placeholder="พิมพ์สายงาน เทคโนโลยี หรือจำนวนคนในทีม…"
            className="h-12 w-full rounded-xl border border-input/60 bg-background px-10 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15"
          />
        </div>
        <Button type="submit" size="lg" disabled={loading || query.trim().length < 2} className="h-12 rounded-xl px-5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
          {loading ? "กำลังหางานที่ใช่…" : "ค้นหาด้วย AI"}
        </Button>
      </form>

      {userSkills.length > 0 ? (
        <p className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Check className="h-3.5 w-3.5 text-primary" /> ใช้ทักษะ {userSkills.length} รายการจากโปรไฟล์ช่วยเลือกให้
        </p>
      ) : null}

      {error ? <p role="alert" className="mt-4 rounded-xl border border-destructive/25 bg-destructive/8 p-3 text-sm text-destructive">{error}</p> : null}
      {message && result !== null ? <p className="mt-5 text-sm text-muted-foreground" role="status">{message}</p> : null}

      {result !== null && result.length > 0 ? (
        <div className="mt-5 space-y-3" aria-live="polite">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">รายการที่เราเลือกให้ {result.length} รายการ</p>
            <button type="button" onClick={() => { setResult(null); setMessage(null); }} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <RotateCcw className="h-3 w-3" /> เคลียร์ผล
            </button>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {result.map(({ competition, reasons }) => {
              const Icon = getCategoryIcon(competition.category);
              const meta = TECH_CATEGORY_META[competition.category];
              return (
                <article key={competition.id} className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4">
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${meta.badgeClassName}`}>
                      <Icon className="h-3.5 w-3.5" /> {meta.shortLabel}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold leading-snug">
                    <Link href={`/competitions/${competition.id}`} className="hover:text-primary hover:underline underline-offset-4">{competition.title}</Link>
                  </h3>
                  <ul className="space-y-1 text-xs leading-relaxed text-muted-foreground">
                    {reasons.map((reason) => <li key={reason} className="flex gap-1.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{reason}</li>)}
                  </ul>
                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3 text-xs">
                    <div className="space-y-1 text-muted-foreground">
                      <p className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-peach-foreground" />{formatThaiDate(competition.deadline)}</p>
                      <p className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-primary" />ทีม {competition.min_size === competition.max_size ? competition.min_size : `${competition.min_size}–${competition.max_size}`} คน</p>
                    </div>
                    <Link href={`/competitions/${competition.id}`} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">ดูรายละเอียด<ArrowRight className="h-3.5 w-3.5" /></Link>
                  </div>
                </article>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">AI เลือกจากรายการเปิดรับในระบบเท่านั้น ตรวจประกาศต้นทางและคุณสมบัติอีกครั้งก่อนสมัคร</p>
        </div>
      ) : null}
    </section>
  );
}
