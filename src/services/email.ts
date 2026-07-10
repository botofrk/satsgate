import { RESEND_API_KEY } from '../config/env';

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log('[Email Service] Skipped (No RESEND_API_KEY configured)');
    return false;
  }

  try {
    const fromAddress = process.env.EMAIL_FROM || 'onboarding@resend.dev';
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `AIPP Gateway <${fromAddress}>`,
        to,
        subject,
        html
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Email Service] Failed to send email to ${to}:`, errText);
      return false;
    }

    console.log(`[Email Service] Email sent successfully to ${to}`);
    return true;
  } catch (err: any) {
    console.error(`[Email Service] Error sending email to ${to}:`, err.message);
    return false;
  }
}
