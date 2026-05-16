import { Resend } from 'resend';

const FROM = 'Dealstack <notification@dealstackhq.com>';

type SendEmailOptions = {
  to: string | string[];
  subject: string;
  html: string;
};

export async function sendEmail({ to, subject, html }: SendEmailOptions) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[Resend] RESEND_API_KEY is not configured');
    }
    console.warn('[Resend] RESEND_API_KEY not set — skipping email send in dev');
    return null;
  }

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
  });

  if (error) {
    console.error('[Resend] Failed to send email:', error);
    throw new Error(error.message);
  }

  return data;
}
