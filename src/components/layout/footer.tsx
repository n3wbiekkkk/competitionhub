import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p>
          <span className="font-medium text-foreground">TechComp Hub</span>
          {" · "}
          ฐานข้อมูลการแข่งขันคอมพิวเตอร์และเทคโนโลยีในไทย
        </p>

        <nav className="flex flex-wrap items-center gap-5">
          <Link href="/" className="transition-colors hover:text-foreground">
            รายการแข่งขัน
          </Link>
          <Link
            href="/my-teams"
            className="transition-colors hover:text-foreground"
          >
            ทีมของฉัน
          </Link>
          <Link
            href="/profile"
            className="transition-colors hover:text-foreground"
          >
            โปรไฟล์สาย Tech
          </Link>
          <Link
            href="/settings"
            className="transition-colors hover:text-foreground"
          >
            ตั้งค่า
          </Link>
        </nav>
      </div>
    </footer>
  );
}
