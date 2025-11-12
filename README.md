# Resender

Cloudflare Worker for managing Resend API contacts with double opt-in functionality.

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
