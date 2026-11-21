import type { ReactNode } from "react";

interface AccountSectionProps {
  id?: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}

export function AccountSection({
  id,
  title,
  description,
  action,
  children,
}: AccountSectionProps) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border pt-10">
      <div className="grid gap-8 lg:grid-cols-12">
        <div className="space-y-1.5 lg:col-span-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            {action}
          </div>
          <p className="text-xs leading-[1.65] text-muted-foreground">
            {description}
          </p>
        </div>
        <div className="lg:col-span-8">{children}</div>
      </div>
    </section>
  );
}
