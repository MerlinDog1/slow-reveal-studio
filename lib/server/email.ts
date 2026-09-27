import { Resend } from "resend";
export async function sendEmail(
  to: string | undefined,
  subject: string,
  text: string,
  idempotencyKey: string,
): Promise<boolean> {
  if (!to || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL)
    return false;
  try {
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send(
      { from: process.env.RESEND_FROM_EMAIL, to, subject, text },
      { idempotencyKey },
    );
    return !error;
  } catch {
    return false;
  }
}
