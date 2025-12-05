# Resender

Cloudflare Worker for managing Resend API contacts with double opt-in functionality.

## Features

- **Contact Form**: Handles form submissions with spam protection
  - Cloudflare Turnstile captcha verification
  - Honeypot field detection
  - Comprehensive request metadata collection for spam identification:
    - IP address (via CF-Connecting-IP)
    - User agent
    - Referer
    - Geographic location (country, region, city, timezone)
    - Network information (ASN, AS Organization, Cloudflare Colo)
    - Timestamp
- **Double Opt-in Subscription**: Email confirmation workflow with KV storage
- **Audience Management**: Support for multiple Resend audiences

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set your Resend API key:
```bash
wrangler secret put RESEND_API_KEY
```

3. For local development, create a `.dev.vars` file:
```
RESEND_API_KEY=your-api-key-here
```

## Development

Run locally:
```bash
npm run dev
```

## Deployment

Deploy to Cloudflare:
```bash
npm run deploy
```

## Configuration

Edit `wrangler.toml` to configure:
- Email sender details
- Confirmation URL
- Audience mappings
- KV namespace bindings

## License

AGPL-3.0
