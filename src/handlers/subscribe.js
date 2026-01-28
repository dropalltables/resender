import { getRequestMeta, analyzeEmail } from '../observability.js';
import { generateConfirmationCode, sendConfirmationEmail } from '../utils.js';

export async function handleSubscribe(request, env) {
  const meta = getRequestMeta(request);
  
  try {
    const formData = await request.formData();
    const email = formData.get('email');
    const turnstileToken = formData.get('cf-turnstile-response');

    if (!turnstileToken) {
      console.log(JSON.stringify({
        event: 'subscribe_error',
        reason: 'missing_turnstile',
        ...meta,
        ts: new Date().toISOString(),
      }));
      return new Response(
        JSON.stringify({ success: false, error: 'Captcha verification required' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
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
      console.log(JSON.stringify({
        event: 'subscribe_error',
        reason: 'turnstile_failed',
        turnstileErrors: turnstileResult['error-codes'],
        ...meta,
        ts: new Date().toISOString(),
      }));
      return new Response(
        JSON.stringify({ success: false, error: 'Captcha verification failed' }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    if (!email) {
      console.log(JSON.stringify({
        event: 'subscribe_error',
        reason: 'missing_email',
        ...meta,
        ts: new Date().toISOString(),
      }));
      return new Response('Email is required', { status: 400 });
    }

    const emailKey = `pending_email:${email}`;
    const existingPending = await env.PENDING_SUBSCRIPTIONS.get(emailKey);
    
    const ipKey = `ip_signups:${meta.ip}`;
    const ipSignupsStr = await env.PENDING_SUBSCRIPTIONS.get(ipKey);
    const ipSignups = ipSignupsStr ? JSON.parse(ipSignupsStr) : [];
    const isMultiEmail = ipSignups.length > 0 && !ipSignups.includes(email);
    const emailCountFromIP = new Set([...ipSignups, email]).size;
    
    if (existingPending) {
      console.log(JSON.stringify({
        event: 'subscribe_duplicate',
        email,
        isMultiEmail,
        emailCountFromIP,
        previousEmailsFromIP: ipSignups,
        ...meta,
        ts: new Date().toISOString(),
      }));
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

    const confirmationCode = generateConfirmationCode();

    const pendingData = {
      email: email,
      firstName: formData.get('first_name') || null,
      lastName: formData.get('last_name') || null,
      audience: formData.get('audience') || null,
      timestamp: Date.now(),
      signupMeta: meta,
    };

    await env.PENDING_SUBSCRIPTIONS.put(
      confirmationCode,
      JSON.stringify(pendingData),
      { expirationTtl: 86400 }
    );
    
    await env.PENDING_SUBSCRIPTIONS.put(
      emailKey,
      confirmationCode,
      { expirationTtl: 86400 }
    );
    
    const updatedIpSignups = [...ipSignups.filter(e => e !== email), email].slice(-20);
    await env.PENDING_SUBSCRIPTIONS.put(
      ipKey,
      JSON.stringify(updatedIpSignups),
      { expirationTtl: 86400 * 7 }
    );

    const emailResponse = await sendConfirmationEmail(email, confirmationCode, env);

    if (!emailResponse.ok) {
      const errorData = await emailResponse.json();
      console.error(JSON.stringify({
        event: 'subscribe_email_failed',
        email,
        error: errorData,
        ...meta,
        ts: new Date().toISOString(),
      }));
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

    const emailAnalysis = analyzeEmail(email);
    
    const suspicionFactors = [];
    if (isMultiEmail && emailCountFromIP >= 3) suspicionFactors.push('multi_email_ip');
    if (emailAnalysis.isDisposable) suspicionFactors.push('disposable_email');
    if (emailAnalysis.looksGenerated) suspicionFactors.push('generated_email');
    if (meta.isLikelyVPN) suspicionFactors.push('vpn_datacenter');
    if (meta.isTor) suspicionFactors.push('tor_exit');
    if (meta.isBot) suspicionFactors.push('bot_ua');
    if (emailAnalysis.hasPlus) suspicionFactors.push('plus_addressing');
    
    const logData = {
      event: 'subscribe_initiated',
      email,
      emailAnalysis,
      audience: formData.get('audience') || null,
      firstName: formData.get('first_name') || null,
      isMultiEmail,
      emailCountFromIP,
      suspicionFactors,
      suspicionScore: suspicionFactors.length,
      ...meta,
      ts: new Date().toISOString(),
    };
    if (isMultiEmail) {
      logData.previousEmailsFromIP = ipSignups;
    }
    
    if (suspicionFactors.length >= 2) {
      console.warn(JSON.stringify(logData));
    } else {
      console.log(JSON.stringify(logData));
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
    console.error(JSON.stringify({
      event: 'subscribe_exception',
      error: error.message,
      ...meta,
      ts: new Date().toISOString(),
    }));
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
