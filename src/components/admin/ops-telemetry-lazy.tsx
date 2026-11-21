"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { OpsTelemetrySnapshot } from "@/lib/ops/telemetry";

const OpsTelemetryPanel = dynamic(
  () => import("./ops-telemetry-panel").then((mod) => mod.OpsTelemetryPanel),
  {
    ssr: false,
    loading: () => (
      <p className="py-4 text-sm text-muted-foreground">กำลังโหลดข้อมูลระบบ...</p>
    ),
  },
);

/**
 * Loads the telemetry panel only after the admin opens it. The snapshot is
 * collected on the server and stays serializable when it crosses the boundary.
 */
export function LazyOpsTelemetry({
  snapshot,
}: {
  snapshot: OpsTelemetrySnapshot;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="border-t border-border pt-8">
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          แสดงข้อมูลการดำเนินงานและประสิทธิภาพ
        </Button>
      </div>
    );
  }

  return <OpsTelemetryPanel snapshot={snapshot} />;
}
