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
      font-family: Helvetica, Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: white;
      color: black;
    }
  </style>
</head>
<body>
  <p>Your subscription has been confirmed.</p>
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
      font-family: Helvetica, Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: white;
      color: black;
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
      font-family: Helvetica, Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: white;
      color: black;
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
