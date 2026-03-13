# Deployment Guide

## Quick Deploy to Vercel

### Option 1: Vercel CLI (Recommended)

```bash
# Install Vercel CLI globally
npm i -g vercel

# Login to Vercel
vercel login

# Deploy from project directory
cd mission-control-dashboard
vercel

# Follow prompts:
# - Set up and deploy: Yes
# - Which scope: [select your account]
# - Link to existing project: No
# - Project name: mission-control-dashboard
# - Directory: ./
# - Override settings: No

# Production deployment
vercel --prod
```

### Option 2: GitHub + Vercel Integration

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit - Mission Control Dashboard"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/mission-control-dashboard.git
   git push -u origin main
   ```

2. **Connect to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - Configure project:
     - Framework Preset: Next.js
     - Build Command: `npm run build`
     - Output Directory: (leave default)
   - Click "Deploy"

3. **Auto-deployments:**
   - Every push to `main` = production deployment
   - Every PR = preview deployment

### Option 3: Netlify

```bash
# Install Netlify CLI
npm i -g netlify-cli

# Login
netlify login

# Deploy
cd mission-control-dashboard
netlify deploy --prod

# Or use Netlify UI:
# 1. Connect GitHub repo
# 2. Build command: npm run build
# 3. Publish directory: .next
```

## Environment Variables

For production with real Bybit API:

1. **In Vercel Dashboard:**
   - Settings → Environment Variables
   - Add:
     ```
     BYBIT_API_KEY=your_api_key_here
     BYBIT_API_SECRET=your_secret_here
     NEXT_PUBLIC_API_URL=https://api.bybit.com
     ```

2. **In code:**
   ```typescript
   // lib/bybit.ts
   const apiKey = process.env.BYBIT_API_KEY;
   const apiSecret = process.env.BYBIT_API_SECRET;
   ```

## Build Optimization

### Analyze Bundle Size

```bash
# Install analyzer
npm install -D @next/bundle-analyzer

# Add to next.config.ts:
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

module.exports = withBundleAnalyzer(nextConfig)

# Run analysis
ANALYZE=true npm run build
```

### Performance Checklist

- [x] Image optimization with next/image
- [x] Code splitting with dynamic imports
- [x] Server Components for static content
- [x] Client Components only where needed
- [x] Lazy loading for heavy components
- [ ] Cache static assets (CDN)
- [ ] Implement ISR for data-heavy pages

## Custom Domain

### Vercel

1. Go to Project Settings → Domains
2. Add your domain: `dashboard.yourdomain.com`
3. Configure DNS:
   ```
   Type: CNAME
   Name: dashboard
   Value: cname.vercel-dns.com
   ```

### Netlify

1. Go to Site Settings → Domain Management
2. Add custom domain
3. Configure DNS as instructed

## Monitoring

### Vercel Analytics

```bash
npm install @vercel/analytics

# Add to app/layout.tsx:
import { Analytics } from '@vercel/analytics/react';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
```

### Error Tracking (Sentry)

```bash
npm install @sentry/nextjs

# Run setup
npx @sentry/wizard@latest -i nextjs
```

## CI/CD Pipeline

### GitHub Actions (Optional)

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run lint
      - run: npm run build
```

## Troubleshooting

### Build Fails

1. **Clear cache:**
   ```bash
   rm -rf .next node_modules
   npm install
   npm run build
   ```

2. **TypeScript errors:**
   - Check `tsconfig.json` strict mode
   - Run `npm run lint` locally first

3. **Missing dependencies:**
   - Ensure all dependencies are in `package.json`
   - Not in devDependencies if needed at runtime

### Slow Performance

1. **Check bundle size:**
   ```bash
   ANALYZE=true npm run build
   ```

2. **Optimize images:**
   - Use next/image
   - Set proper width/height
   - Use WebP format

3. **Server Component conversion:**
   - Move data fetching to Server Components
   - Only use 'use client' where necessary

---

**Questions?** Check [Next.js Deployment Docs](https://nextjs.org/docs/deployment)
