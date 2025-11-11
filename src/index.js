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

    // Route: Confirm subscription
    if (url.pathname === '/confirm' && request.method === 'GET') {
      return handleConfirmation(request, env, url);
    }

    // Route: Subscribe (initial submission)
    if (request.method === 'POST') {
      return handleSubscribe(request, env);
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

    // Generate confirmation code
    const confirmationCode = generateConfirmationCode();

    // Store pending subscription in KV with 24 hour expiration
    const pendingData = {
      email: email,
      firstName: formData.get('first_name') || null,
      lastName: formData.get('last_name') || null,
      timestamp: Date.now(),
    };

    await env.PENDING_SUBSCRIPTIONS.put(
      confirmationCode,
      JSON.stringify(pendingData),
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

    // Call Resend API to add contact to audience
    const resendResponse = await fetch(
      'https://api.resend.com/contacts',
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

    // Delete the confirmation code from KV
    await env.PENDING_SUBSCRIPTIONS.delete(confirmationCode);

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
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      background: white;
      padding: 3rem;
      border-radius: 1rem;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
      max-width: 500px;
    }
    .checkmark {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      display: block;
      stroke-width: 2;
      stroke: #4bb543;
      stroke-miterlimit: 10;
      margin: 0 auto 2rem;
      box-shadow: inset 0px 0px 0px #4bb543;
      animation: fill .4s ease-in-out .4s forwards, scale .3s ease-in-out .9s both;
    }
    .checkmark__circle {
      stroke-dasharray: 166;
      stroke-dashoffset: 166;
      stroke-width: 2;
      stroke-miterlimit: 10;
      stroke: #4bb543;
      fill: none;
      animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
    }
    .checkmark__check {
      transform-origin: 50% 50%;
      stroke-dasharray: 48;
      stroke-dashoffset: 48;
      animation: stroke 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.8s forwards;
    }
    @keyframes stroke {
      100% { stroke-dashoffset: 0; }
    }
    @keyframes scale {
      0%, 100% { transform: none; }
      50% { transform: scale3d(1.1, 1.1, 1); }
    }
    @keyframes fill {
      100% { box-shadow: inset 0px 0px 0px 30px #4bb543; }
    }
    h1 {
      color: #333;
      margin-bottom: 1rem;
    }
    p {
      color: #666;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="container">
    <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
      <circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none"/>
      <path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
    </svg>
    <h1>Subscription Confirmed!</h1>
    <p>Thank you for confirming your email address. You're now subscribed to our mailing list.</p>
    <p style="margin-top: 2rem; font-size: 0.9rem; color: #999;">You can close this window.</p>
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
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      background: white;
      padding: 3rem;
      border-radius: 1rem;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
      max-width: 500px;
    }
    h1 {
      color: #e74c3c;
      margin-bottom: 1rem;
    }
    p {
      color: #666;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Subscription Error</h1>
    <p>There was an error confirming your subscription. Please try again or contact support.</p>
    <p style="margin-top: 2rem; font-size: 0.9rem; color: #999;">Error: ${resendData.message || 'Unknown error'}</p>
  </div>
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
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      background: white;
      padding: 3rem;
      border-radius: 1rem;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
      max-width: 500px;
    }
    h1 {
      color: #e74c3c;
      margin-bottom: 1rem;
    }
    p {
      color: #666;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Error</h1>
    <p>An unexpected error occurred. Please try again later.</p>
    <p style="margin-top: 2rem; font-size: 0.9rem; color: #999;">${error.message}</p>
  </div>
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
