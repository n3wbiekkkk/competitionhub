import Link from "next/link";

export interface AccountSubNavItem {
  href: string;
  label: string;
}

interface AccountSubNavProps {
  label: string;
  items: AccountSubNavItem[];
}

export function AccountSubNav({ label, items }: AccountSubNavProps) {
  return (
    <nav
      aria-label={label}
      className="w-full shrink-0 lg:sticky lg:top-6 lg:w-60 lg:self-start"
    >
      <p className="mb-3 px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
        ในหน้านี้
      </p>
      <ul className="flex gap-1 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
        {items.map((item) => (
          <li key={item.href} className="shrink-0 lg:w-full">
            <Link
              href={item.href}
              className="flex min-h-10 items-center whitespace-nowrap rounded-lg border-l-2 border-transparent px-3 text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-muted/50 hover:text-foreground"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
