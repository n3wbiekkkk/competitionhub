"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface CompetitionDetailTabsProps {
  details: ReactNode;
  team: ReactNode;
  community: ReactNode;
}

const TAB_ITEMS = [
  { value: "details", label: "รายละเอียดและเกณฑ์" },
  { value: "team", label: "เพื่อนที่สนใจและหาทีม" },
  { value: "community", label: "ถาม-ตอบและประกาศ" },
] as const;

export function CompetitionDetailTabs({
  details,
  team,
  community,
}: CompetitionDetailTabsProps) {
  return (
    <Tabs defaultValue="details" className="gap-0">
      <div className="-mx-1 overflow-x-auto px-1">
        <TabsList
          variant="line"
          className="h-auto w-max gap-6 rounded-none bg-transparent p-0"
        >
          {TAB_ITEMS.map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className="h-auto rounded-none px-0 pb-3 pt-0 text-sm data-active:text-foreground"
            >
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <div className="border-t border-border pt-8">
        <TabsContent
          value="details"
          forceMount
          className="mt-0 data-[state=inactive]:hidden"
        >
          {details}
        </TabsContent>
        <TabsContent
          value="team"
          forceMount
          className="mt-0 data-[state=inactive]:hidden"
        >
          {team}
        </TabsContent>
        <TabsContent
          value="community"
          forceMount
          className="mt-0 data-[state=inactive]:hidden"
        >
          {community}
        </TabsContent>
      </div>
    </Tabs>
  );
}
