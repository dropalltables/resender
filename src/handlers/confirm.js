import { getRequestMeta } from '../observability.js';

export async function handleConfirmation(request, env, url) {
  const meta = getRequestMeta(request);
  
  try {
    const confirmationCode = url.searchParams.get('code');

    if (!confirmationCode) {
      console.log(JSON.stringify({
        event: 'confirm_error',
        reason: 'missing_code',
        ...meta,
        ts: new Date().toISOString(),
      }));
      return new Response('Invalid confirmation link', { status: 400 });
    }

    const pendingDataStr = await env.PENDING_SUBSCRIPTIONS.get(confirmationCode);

    if (!pendingDataStr) {
      console.log(JSON.stringify({
        event: 'confirm_expired',
        code: confirmationCode.slice(0, 8) + '...',
        ...meta,
        ts: new Date().toISOString(),
      }));
      return new Response(
        'Confirmation link expired or invalid. Please try subscribing again.',
        { status: 404 }
      );
    }

    const pendingData = JSON.parse(pendingDataStr);
    const signupMeta = pendingData.signupMeta || {};
    
    const locationMismatch = signupMeta.ip && signupMeta.ip !== meta.ip;
    const countryMismatch = signupMeta.country && signupMeta.country !== meta.country;

    const resendPayload = {
      email: pendingData.email,
      unsubscribed: false
    };

    if (pendingData.firstName) {
      resendPayload.firstName = pendingData.firstName;
    }
    
    if (pendingData.lastName) {
      resendPayload.lastName = pendingData.lastName;
    }

    let apiEndpoint = 'https://api.resend.com/contacts';
    if (pendingData.audience) {
      const audienceKey = `AUDIENCE_${pendingData.audience.toUpperCase()}`;
      const audienceId = env[audienceKey];
      
      if (audienceId) {
        apiEndpoint = `https://api.resend.com/audiences/${audienceId}/contacts`;
      }
    }

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

    await env.PENDING_SUBSCRIPTIONS.delete(confirmationCode);
    await env.PENDING_SUBSCRIPTIONS.delete(`pending_email:${pendingData.email}`);

    const confirmLogData = {
      event: resendResponse.ok ? 'confirm_success' : 'confirm_api_error',
      email: pendingData.email,
      audience: pendingData.audience,
      signupToConfirmMs: Date.now() - pendingData.timestamp,
      locationMismatch,
      countryMismatch,
      signupIP: signupMeta.ip,
      signupCountry: signupMeta.country,
      signupReferer: signupMeta.referer,
      ...meta,
      ts: new Date().toISOString(),
    };
    
    if (!resendResponse.ok) {
      confirmLogData.apiError = resendData;
      console.error(JSON.stringify(confirmLogData));
    } else if (locationMismatch || countryMismatch) {
      console.warn(JSON.stringify(confirmLogData));
    } else {
      console.log(JSON.stringify(confirmLogData));
    }

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
    console.error(JSON.stringify({
      event: 'confirm_exception',
      error: error.message,
      ...meta,
      ts: new Date().toISOString(),
    }));
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
