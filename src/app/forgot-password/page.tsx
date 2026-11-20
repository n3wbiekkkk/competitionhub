import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata = {
  title: "รีเซ็ตรหัสผ่าน",
  referrer: "no-referrer" as const,
};

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <ForgotPasswordForm />
    </main>
  );
}
