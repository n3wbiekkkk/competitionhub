"use client";

import { useState, type FormEvent } from "react";
import { History, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AccountSection } from "@/components/account/account-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_LABELS_TH,
  type WebhookDeliveryItem,
  type WebhookEvent,
  type WebhookRouteItem,
} from "@/lib/integrations/webhook-events";
import { formatThaiDate } from "@/lib/utils/thai-date";

export function WebhookRoutingManager({
  initialRoutes,
}: {
  initialRoutes: WebhookRouteItem[];
}) {
  const [routes, setRoutes] = useState(initialRoutes);
  const [name, setName] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>([
    "result.verified",
  ]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deliveries, setDeliveries] = useState<Record<string, WebhookDeliveryItem[]>>({});
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);

  function toggleEvent(event: WebhookEvent) {
    setEvents((current) =>
      current.includes(event)
        ? current.filter((item) => item !== event)
        : [...current, event],
    );
  }

  async function createRoute(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (events.length === 0) {
      toast.error("เลือกเหตุการณ์อย่างน้อย 1 รายการ");
      return;
    }
    setCreating(true);
    try {
      const response = await fetch("/api/admin/webhooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, targetUrl, events, isActive: true }),
      });
      const data = (await response.json()) as {
        route?: WebhookRouteItem;
        error?: string;
      };
      if (!response.ok || !data.route) {
        toast.error(data.error ?? "ไม่สามารถสร้างปลายทางเว็บฮุกได้");
        return;
      }
      setRoutes((current) => [data.route as WebhookRouteItem, ...current]);
      setName("");
      setTargetUrl("");
      setEvents(["result.verified"]);
      toast.success("เพิ่มปลายทางเว็บฮุกแล้ว");
    } catch {
      toast.error("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(route: WebhookRouteItem) {
    setBusyId(route.id);
    try {
      const response = await fetch(`/api/admin/webhooks/${route.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: !route.is_active }),
      });
      const data = (await response.json()) as {
        route?: WebhookRouteItem;
        error?: string;
      };
      if (!response.ok || !data.route) {
        toast.error(data.error ?? "ไม่สามารถเปลี่ยนสถานะปลายทางได้");
        return;
      }
      const updated = data.route as WebhookRouteItem;
      setRoutes((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      toast.success(updated.is_active ? "เปิดใช้งานปลายทางแล้ว" : "ระงับปลายทางแล้ว");
    } catch {
      toast.error("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setBusyId(null);
    }
  }

  async function removeRoute(route: WebhookRouteItem) {
    setBusyId(route.id);
    try {
      const response = await fetch(`/api/admin/webhooks/${route.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        toast.error("ไม่สามารถลบปลายทางเว็บฮุกได้");
        return;
      }
      setRoutes((current) => current.filter((item) => item.id !== route.id));
      toast.success("ลบปลายทางเว็บฮุกแล้ว");
    } catch {
      toast.error("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setBusyId(null);
    }
  }

  async function sendTest(route: WebhookRouteItem) {
    setBusyId(route.id);
    try {
      const response = await fetch(`/api/admin/webhooks/${route.id}/test`, {
        method: "POST",
      });
      const data = (await response.json()) as {
        outcome?: { status: "sent" | "failed"; error: string | null };
        error?: string;
      };
      if (!response.ok) {
        toast.error(data.error ?? "ไม่สามารถทดสอบส่งเว็บฮุกได้");
        return;
      }
      if (data.outcome?.status === "sent") {
        toast.success("ส่งคำทดสอบสำเร็จ");
      } else {
        toast.error(data.outcome?.error ?? "ปลายทางไม่ได้รับคำทดสอบ");
      }
      setHistoryOpen(route.id);
      await loadHistory(route.id);
    } catch {
      toast.error("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setBusyId(null);
    }
  }

  async function loadHistory(routeId: string) {
    try {
      const response = await fetch(`/api/admin/webhooks/${routeId}/deliveries`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = (await response.json()) as {
        deliveries: WebhookDeliveryItem[];
      };
      setDeliveries((current) => ({ ...current, [routeId]: data.deliveries }));
    } catch {
      toast.error("ไม่สามารถโหลดประวัติการส่งได้");
    }
  }

  async function toggleHistory(routeId: string) {
    if (historyOpen === routeId) {
      setHistoryOpen(null);
      return;
    }
    setHistoryOpen(routeId);
    await loadHistory(routeId);
  }

  return (
    <div className="space-y-10">
      <AccountSection
        title="เพิ่มปลายทางเว็บฮุก"
        description="ระบบจะตรวจสอบความปลอดภัยของลิงก์ก่อนบันทึกและก่อนส่งทุกครั้ง เฉพาะลิงก์สาธารณะเท่านั้นที่อนุญาต"
      >
        <form onSubmit={(event) => void createRoute(event)} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="webhook-name">ชื่อปลายทาง</Label>
              <Input
                id="webhook-name"
                required
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="เช่น ระบบประกาศ_results ของโรงเรียน"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="webhook-url">ลิงก์ปลายทาง (HTTPS)</Label>
              <Input
                id="webhook-url"
                required
                type="url"
                maxLength={2048}
                value={targetUrl}
                onChange={(event) => setTargetUrl(event.target.value)}
                placeholder="https://example.com/hooks/techcomp"
                className="font-mono text-xs"
              />
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">เหตุการณ์ที่ส่ง</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {WEBHOOK_EVENTS.map((event) => (
                <label
                  key={event}
                  className="flex items-center gap-2 text-xs text-foreground"
                >
                  <Checkbox
                    checked={events.includes(event)}
                    onCheckedChange={() => toggleEvent(event)}
                  />
                  {WEBHOOK_EVENT_LABELS_TH[event]}
                </label>
              ))}
            </div>
          </fieldset>
          <Button type="submit" size="sm" disabled={creating} className="gap-2 rounded-lg">
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            เพิ่มปลายทาง
          </Button>
        </form>
      </AccountSection>

      <AccountSection
        title="ปลายทางที่ใช้งาน"
        description="ทดสอบการส่ง ดูประวัติผลการส่ง และระงับปลายทางที่ไม่ใช้งาน"
      >
        {routes.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">ยังไม่มีปลายทางเว็บฮุก</p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {routes.map((route) => {
              const routeHistory = deliveries[route.id] ?? [];
              const isHistoryOpen = historyOpen === route.id;
              return (
                <li key={route.id} className="space-y-3 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{route.name}</p>
                        <Badge variant={route.is_active ? "default" : "secondary"} className="rounded-md">
                          {route.is_active ? "ใช้งานอยู่" : "ระงับ"}
                        </Badge>
                      </div>
                      <p className="break-all font-mono text-[11px] text-muted-foreground">
                        {route.target_url}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {route.events
                          .map((event) =>
                            WEBHOOK_EVENT_LABELS_TH[event as WebhookEvent] ?? event,
                          )
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={busyId === route.id || !route.is_active}
                        onClick={() => void sendTest(route)}
                        className="gap-1.5"
                      >
                        <Send className="h-3 w-3" />
                        ทดสอบส่ง
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={busyId === route.id}
                        onClick={() => void toggleActive(route)}
                      >
                        {route.is_active ? "ระงับ" : "เปิดใช้งาน"}
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => void toggleHistory(route.id)}
                        className="gap-1.5"
                      >
                        <History className="h-3 w-3" />
                        ประวัติ
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="destructive"
                        disabled={busyId === route.id}
                        onClick={() => void removeRoute(route)}
                        className="gap-1.5"
                      >
                        <Trash2 className="h-3 w-3" />
                        ลบ
                      </Button>
                    </div>
                  </div>
                  {isHistoryOpen ? (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {routeHistory.length === 0 ? (
                        <li className="px-3 py-2 text-xs text-muted-foreground">
                          ยังไม่มีประวัติการส่ง
                        </li>
                      ) : (
                        routeHistory.map((delivery) => (
                          <li
                            key={delivery.id}
                            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                          >
                            <span className="text-foreground">
                              {delivery.event_type} · {delivery.http_status ?? "-"}
                            </span>
                            <span className="text-muted-foreground">
                              {delivery.status === "sent" ? "ส่งสำเร็จ" : (delivery.error ?? "ส่งไม่สำเร็จ")}
                              {" · "}
                              {formatThaiDate(delivery.created_at.slice(0, 10), "short")}
                            </span>
                          </li>
                        ))
                      )}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </AccountSection>
    </div>
  );
}
