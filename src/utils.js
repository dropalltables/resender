export function generateConfirmationCode() {
  return crypto.randomUUID();
}

export function sanitizeText(text) {
  if (!text) return '';
  return String(text).replace(/\0/g, '').replace(/[\r\n]/g, ' ').trim();
}

export async function sendConfirmationEmail(email, confirmationCode, env) {
  const confirmationUrl = `${env.CONFIRMATION_BASE_URL}/confirm?code=${confirmationCode}`;
  
  const emailBody = `Please confirm your subscription, by clicking the link below:

${confirmationUrl}

If you didn't request this subscription, you can safely ignore this email.`;

  const emailPayload = {
    from: `${env.FROM_NAME} <${env.FROM_EMAIL}>`,
    to: [email],
    subject: 'Confirm your subscription',
    text: emailBody,
  };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailPayload),
  });

  return response;
}
