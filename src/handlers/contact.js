import { sanitizeText } from '../utils.js';

export async function handleContact(request, env) {
  try {
    const formData = await request.formData();
    const name = formData.get('name');
    const email = formData.get('email');
    const message = formData.get('message');
    const website = formData.get('website');
    const turnstileToken = formData.get('cf-turnstile-response');

    const clientIP = request.headers.get('CF-Connecting-IP') || 'Unknown';
    const userAgent = request.headers.get('User-Agent') || 'Unknown';
    const referer = request.headers.get('Referer') || 'None';
    
    const cf = request.cf || {};
    const country = cf.country || 'Unknown';
    const city = cf.city || 'Unknown';
    const region = cf.region || 'Unknown';
    const timezone = cf.timezone || 'Unknown';
    const asn = cf.asn || 'Unknown';
    const asOrganization = cf.asOrganization || 'Unknown';
    const colo = cf.colo || 'Unknown';

    if (!turnstileToken) {
      return new Response('Captcha verification required', {
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    const turnstileResponse = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: env.TURNSTILE_SECRET_KEY,
          response: turnstileToken,
        }),
      }
    );

    const turnstileResult = await turnstileResponse.json();

    if (!turnstileResult.success) {
      return new Response('Captcha verification failed', {
        status: 403,
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    if (website) {
      return new Response('', {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    if (!name || !email || !message) {
      return new Response('Name, email, and message are required', {
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    const emailText = `Name: ${sanitizeText(name)}
Email: ${sanitizeText(email)}

Message:
${sanitizeText(message)}

--- Request Information ---
IP Address: ${clientIP}
User Agent: ${sanitizeText(userAgent)}
Referer: ${sanitizeText(referer)}

--- Location Information ---
Country: ${country}
Region: ${region}
City: ${city}
Timezone: ${timezone}

--- Network Information ---
ASN: ${asn}
AS Organization: ${asOrganization}
Cloudflare Colo: ${colo}

--- Timestamp ---
${new Date().toISOString()}`;

    const emailPayload = {
      from: `${env.CONTACT_FROM_NAME} <${env.CONTACT_FROM_EMAIL}>`,
      to: [env.CONTACT_TO_EMAIL],
      reply_to: sanitizeText(email),
      subject: `Contact Form: ${sanitizeText(name)}`,
      text: emailText,
    };

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Failed to send contact email:', errorData);
      return new Response('Failed to send message', {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return new Response('', {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (error) {
    console.error('Contact form error:', error);
    return new Response('An error occurred', {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
