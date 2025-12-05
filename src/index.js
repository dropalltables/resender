export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Route: Contact form
    if (url.pathname === '/contact' && request.method === 'POST') {
      return handleContact(request, env);
    }

    // Route: Subscribe (initial submission)
    if (url.pathname === '/subscribe' && request.method === 'POST') {
      return handleSubscribe(request, env);
    }

    // Route: Confirm subscription
    if (url.pathname === '/confirm' && request.method === 'GET') {
      return handleConfirmation(request, env, url);
    }

    // Route: Root path - show ASCII art
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(
        `                                  __
   ________  ________  ____  ____/ /__  _____
  / ___/ _ \\/ ___/ _ \\/ __ \\/ __  / _ \\/ ___/
 / /  /  __(__  )  __/ / / / /_/ /  __/ /
/_/   \\___/____/\\___/_/ /_/\\__,_/\\___/_/

https://github.com/dropalltables/resender
`,
        {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
          },
        }
      );
    }

    return new Response('Method not allowed', { status: 405 });
  },
};

// Generate a random confirmation code
function generateConfirmationCode() {
  return crypto.randomUUID();
}

// Send confirmation email via Resend
async function sendConfirmationEmail(email, confirmationCode, env) {
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

// Handle contact form submission
async function handleContact(request, env) {
  try {
    // Parse form data
    const formData = await request.formData();
    const name = formData.get('name');
    const email = formData.get('email');
    const message = formData.get('message');
    const website = formData.get('website'); // honeypot field
    const turnstileToken = formData.get('cf-turnstile-response');

    // Collect request metadata for spam prevention
    const clientIP = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'Unknown';
    const userAgent = request.headers.get('User-Agent') || 'Unknown';
    const referer = request.headers.get('Referer') || 'None';
    
    // Extract Cloudflare-specific metadata
    const cf = request.cf || {};
    const country = cf.country || 'Unknown';
    const city = cf.city || 'Unknown';
    const region = cf.region || 'Unknown';
    const timezone = cf.timezone || 'Unknown';
    const asn = cf.asn || 'Unknown';
    const asOrganization = cf.asOrganization || 'Unknown';
    const colo = cf.colo || 'Unknown';

    // Verify Turnstile token
    if (!turnstileToken) {
      return new Response('Captcha verification required', {
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    // Verify token with Cloudflare
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

    // Honeypot check - if the website field is filled, it's likely a bot
    if (website) {
      // Return success to the bot but don't actually send email
      return new Response('', {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    // Validate required fields
    if (!name || !email || !message) {
      return new Response('Name, email, and message are required', {
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    // Build detailed email with request metadata
    const emailText = `Name: ${name}
Email: ${email}

Message:
${message}

--- Request Information ---
IP Address: ${clientIP}
User Agent: ${userAgent}
Referer: ${referer}

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

    // Send email via Resend
    const emailPayload = {
      from: `${env.CONTACT_FROM_NAME} <${env.CONTACT_FROM_EMAIL}>`,
      to: [env.CONTACT_TO_EMAIL],
      reply_to: email,
      subject: `Contact Form: ${name}`,
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

    // Return 204 No Content for successful submission
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

// Handle initial subscription request
async function handleSubscribe(request, env) {
  try {
    // Parse form data
    const formData = await request.formData();
    const email = formData.get('email');

    // Validate email is present
    if (!email) {
      return new Response('Email is required', { status: 400 });
    }

    // Check if this email already has a pending confirmation
    const emailKey = `pending_email:${email}`;
    const existingPending = await env.PENDING_SUBSCRIPTIONS.get(emailKey);
    
    if (existingPending) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Confirmation email already sent. Please check your inbox.' 
        }), 
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // Generate confirmation code
    const confirmationCode = generateConfirmationCode();

    // Store pending subscription in KV with 24 hour expiration
    const pendingData = {
      email: email,
      firstName: formData.get('first_name') || null,
      lastName: formData.get('last_name') || null,
      audience: formData.get('audience') || null,
      timestamp: Date.now(),
    };

    // Store both the confirmation code and email tracking key
    await env.PENDING_SUBSCRIPTIONS.put(
      confirmationCode,
      JSON.stringify(pendingData),
      { expirationTtl: 86400 } // 24 hours
    );
    
    // Store email tracking key to prevent duplicates
    await env.PENDING_SUBSCRIPTIONS.put(
      emailKey,
      confirmationCode,
      { expirationTtl: 86400 } // 24 hours
    );

    // Send confirmation email
    const emailResponse = await sendConfirmationEmail(email, confirmationCode, env);

    if (!emailResponse.ok) {
      const errorData = await emailResponse.json();
      console.error('Failed to send confirmation email:', errorData);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to send confirmation email' 
        }), 
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Confirmation email sent. Please check your inbox.' 
      }), 
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }), 
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}

// Handle confirmation link click
async function handleConfirmation(request, env, url) {
  try {
    const confirmationCode = url.searchParams.get('code');

    if (!confirmationCode) {
      return new Response('Invalid confirmation link', { status: 400 });
    }

    // Retrieve pending subscription from KV
    const pendingDataStr = await env.PENDING_SUBSCRIPTIONS.get(confirmationCode);

    if (!pendingDataStr) {
      return new Response(
        'Confirmation link expired or invalid. Please try subscribing again.',
        { status: 404 }
      );
    }

    const pendingData = JSON.parse(pendingDataStr);

    // Prepare Resend API request with only email (required)
    const resendPayload = {
      email: pendingData.email,
      unsubscribed: false
    };

    // Add optional fields only if they exist
    if (pendingData.firstName) {
      resendPayload.firstName = pendingData.firstName;
    }
    
    if (pendingData.lastName) {
      resendPayload.lastName = pendingData.lastName;
    }

    // Determine API endpoint based on whether audience is provided
    let apiEndpoint = 'https://api.resend.com/contacts';
    if (pendingData.audience) {
      // Look up audience ID from environment variable (e.g., AUDIENCE_BLOG)
      const audienceKey = `AUDIENCE_${pendingData.audience.toUpperCase()}`;
      const audienceId = env[audienceKey];
      
      if (audienceId) {
        apiEndpoint = `https://api.resend.com/audiences/${audienceId}/contacts`;
      }
    }

    // Call Resend API to add contact to audience
    const resendResponse = await fetch(
      apiEndpoint,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(resendPayload),
      }
    );

    const resendData = await resendResponse.json();

    // Delete both the confirmation code and email tracking key from KV
    await env.PENDING_SUBSCRIPTIONS.delete(confirmationCode);
    await env.PENDING_SUBSCRIPTIONS.delete(`pending_email:${pendingData.email}`);

    // Return response
    if (resendResponse.ok) {
      return new Response(
        `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Subscription Confirmed</title>
  <style>
    body {
      font-family: sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
    }
  </style>
</head>
<body>
  <div>
    <p>Your subscription has been confirmed.</p>
    <p>You may now close this tab.</p>
  </div>
</body>
</html>`,
        {
          status: 200,
          headers: {
            'Content-Type': 'text/html',
          },
        }
      );
    } else {
      return new Response(
        `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Subscription Error</title>
  <style>
    body {
      font-family: sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
    }
  </style>
</head>
<body>
  <p>There was an error confirming your subscription.</p>
</body>
</html>`,
        {
          status: resendResponse.status,
          headers: {
            'Content-Type': 'text/html',
          },
        }
      );
    }
  } catch (error) {
    return new Response(
      `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error</title>
  <style>
    body {
      font-family: sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
    }
  </style>
</head>
<body>
  <p>An unexpected error occurred.</p>
</body>
</html>`,
      {
        status: 500,
        headers: {
          'Content-Type': 'text/html',
        },
      }
    );
  }
}
