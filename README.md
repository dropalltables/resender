# Resender - Cloudflare Worker

A Cloudflare Worker that handles contact submissions to the Resend API.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

For local development:
```bash
cp .dev.vars.example .dev.vars
# Edit .dev.vars and add your RESEND_API_KEY
```

For production (Cloudflare):
```bash
wrangler secret put RESEND_API_KEY
# Enter your Resend API key when prompted
```

### 3. Local Development

```bash
npm run dev
```

This will start a local development server at `http://localhost:8787`

### 4. Deploy to Cloudflare

```bash
npm run deploy
```

## Git Deployment Setup

### Option 1: GitHub Actions (Recommended)

1. **Create a GitHub repository** and push your code:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/yourusername/resender.git
   git push -u origin main
   ```

2. **Get your Cloudflare API Token**:
   - Go to https://dash.cloudflare.com/profile/api-tokens
   - Click "Create Token"
   - Use the "Edit Cloudflare Workers" template
   - Copy the token

3. **Add secrets to GitHub**:
   - Go to your repo → Settings → Secrets and variables → Actions
   - Add these secrets:
     - `CLOUDFLARE_API_TOKEN`: Your Cloudflare API token
     - `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID (found in Workers dashboard)
     - `RESEND_API_KEY`: Your Resend API key

4. **Create GitHub Actions workflow** (see `.github/workflows/deploy.yml`)

### Option 2: Cloudflare Pages (Git Integration)

1. Go to Cloudflare Dashboard → Workers & Pages
2. Click "Create Application" → "Pages" → "Connect to Git"
3. Connect your GitHub/GitLab repository
4. Configure build settings:
   - Build command: `npm run deploy`
   - Build output directory: (leave empty for Workers)
5. Add environment variable `RESEND_API_KEY` in Pages settings

### Option 3: Manual Deployment

Simply run:
```bash
npm run deploy
```

## API Usage

### Endpoint

POST to your worker URL (e.g., `https://resender.your-subdomain.workers.dev`)

### Request Format

```bash
curl -X POST https://resender.your-subdomain.workers.dev \
  -H "Content-Type: multipart/form-data" \
  -F "email=user@example.com" \
  -F "first_name=John" \
  -F "last_name=Doe"
```

### Required Fields
- `email`: Email address (required)

### Optional Fields
- `first_name`: First name
- `last_name`: Last name

### Response

Success:
```json
{
  "success": true,
  "data": { ... }
}
```

Error:
```json
{
  "success": false,
  "error": "Error message"
}
```

## Project Structure

```
resender/
├── src/
│   └── index.js          # Worker code
├── .dev.vars.example     # Example environment variables
├── .gitignore           # Git ignore rules
├── package.json         # Dependencies and scripts
├── wrangler.toml        # Cloudflare Worker configuration
└── README.md           # This file
```

## Troubleshooting

### "RESEND_API_KEY is not defined"
Make sure you've set the secret:
```bash
wrangler secret put RESEND_API_KEY
```

### "Unauthorized" errors
Check that your Resend API key is valid and has the correct permissions.

### CORS issues
The worker includes CORS headers for all origins (`*`). Modify the `Access-Control-Allow-Origin` header in `src/index.js` if you need to restrict access.
