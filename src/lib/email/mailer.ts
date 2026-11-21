import nodemailer from "nodemailer";
import { logEvent } from "@/lib/utils/logger";

interface MailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface MailResult {
  delivered: boolean;
  error: string | null;
}

export async function sendMail(input: MailInput): Promise<MailResult> {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  if (!host || !from) {
    logEvent("info", "email.not_configured", {
      to: input.to,
      subject: input.subject,
    });
    return { delivered: false, error: "SMTP ไม่ได้ตั้งค่า" };
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER?.trim() || undefined;
  const pass = process.env.SMTP_PASS || undefined;
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  try {
    await transport.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { delivered: true, error: null };
  } finally {
    transport.close();
  }
}
