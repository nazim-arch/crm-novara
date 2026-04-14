import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = 'Dealstack <notification@dealstackhq.com>';

type SendEmailOptions = {
  to: string | string[];
  subject: string;
  html: string;
};

export async function sendEmail({ to, subject, html }: SendEmailOptions) {
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
