export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Only allow POST requests
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      // Parse form data
      const formData = await request.formData();
      const email = formData.get('email');

      // Validate email is present
      if (!email) {
        return new Response('Email is required', { status: 400 });
      }

      // Prepare Resend API request with only email (required)
      const resendPayload = {
        email: email,
        unsubscribed: false
      };

      // Add optional fields only if they exist
      const firstName = formData.get('first_name');
      const lastName = formData.get('last_name');
      
      if (firstName) {
        resendPayload.firstName = firstName;
      }
      
      if (lastName) {
        resendPayload.lastName = lastName;
      }

      // Call Resend API - NEW endpoint without audience ID
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

      // Return response
      if (resendResponse.ok) {
        return new Response(JSON.stringify({ success: true, data: resendData }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } else {
        return new Response(JSON.stringify({ success: false, error: resendData }), {
          status: resendResponse.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};
