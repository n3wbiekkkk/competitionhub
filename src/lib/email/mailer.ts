import nodemailer from "nodemailer";
import { logEvent } from "@/lib/utils/logger";

interface MailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendMail(input: MailInput): Promise<void> {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  if (!host || !from) {
    logEvent("info", "email.dev_mode", {
      to: input.to,
      subject: input.subject,
      note: "SMTP not configured; message was not delivered",
    });
    return;
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
  await transport.sendMail({ from, to: input.to, subject: input.subject, text: input.text, html: input.html });
  await transport.close();
}
