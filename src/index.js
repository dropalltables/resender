import { handleSubscribe } from './handlers/subscribe.js';
import { handleConfirmation } from './handlers/confirm.js';
import { handleContact } from './handlers/contact.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (url.pathname === '/contact' && request.method === 'POST') {
      return handleContact(request, env);
    }

    if (url.pathname === '/subscribe' && request.method === 'POST') {
      return handleSubscribe(request, env);
    }

    if (url.pathname === '/confirm' && request.method === 'GET') {
      return handleConfirmation(request, env, url);
    }

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
