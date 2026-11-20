import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata = {
  title: "ตั้งรหัสผ่านใหม่",
  referrer: "no-referrer" as const,
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <ResetPasswordForm token={token ?? null} />
    </main>
  );
}
