# Firebase Deployment Guide

This guide shows how to deploy your Support Alert System to Firebase using Firebase Functions and Firebase Hosting.

## Prerequisites

1. **Firebase Project**: You need a Firebase project (already created: `support-alert-system-385b1`)
2. **Blaze Plan**: Firebase Functions require the Blaze (pay-as-you-go) plan
3. **Firebase CLI**: Already installed and authenticated

## Architecture

```
Firebase Project
├── Firebase Functions (Backend API)
│   ├── /support (GET/POST) - Support data endpoint
│   └── /health (GET) - Health check
└── Firebase Hosting (Frontend)
    └── React Dashboard App
```

## Step 1: Upgrade to Blaze Plan

1. Visit: https://console.firebase.google.com/project/support-alert-system-385b1/usage/details
2. Click "Upgrade to Blaze plan"
3. Set up billing (Firebase Functions have a generous free tier)

## Step 2: Deploy Firebase Functions

```bash
# Build and deploy functions
npm run build:functions
firebase deploy --only functions

# Or deploy everything
firebase deploy
```

Your functions will be available at:
- **Support API**: `https://us-central1-support-alert-system-385b1.cloudfunctions.net/support`
- **Health Check**: `https://us-central1-support-alert-system-385b1.cloudfunctions.net/health`

## Step 3: Deploy React App to Firebase Hosting

```bash
# Build React app
npm run build:client

# Deploy hosting
firebase deploy --only hosting

# Or deploy everything
firebase deploy
```

Your app will be available at:
- **Dashboard**: `https://support-alert-system-385b1.web.app`

## Step 4: Configure HubSpot Webhook

Set your HubSpot webhook URL to:
```
https://us-central1-support-alert-system-385b1.cloudfunctions.net/support
```

## NPM Scripts

Add these to your root `package.json`:

```json
{
  "scripts": {
    "build:client": "cd client && npm run build",
    "build:functions": "cd functions && npm run build",
    "deploy": "npm run build:client && npm run build:functions && firebase deploy",
    "deploy:hosting": "npm run build:client && firebase deploy --only hosting",
    "deploy:functions": "npm run build:functions && firebase deploy --only functions",
    "test:firebase": "node test-firebase-functions.js"
  }
}
```

## Testing

### Test Firebase Functions
```bash
npm run test:firebase
```

### Test React App Locally (with deployed functions)
```bash
cd client && npm start
```

### Firebase Emulator Suite (Development)
```bash
# Start emulators
firebase emulators:start

# Your app will run on:
# - Functions: http://localhost:5001/support-alert-system-385b1/us-central1
# - Hosting: http://localhost:5000
```

## Environment Configuration

The React app automatically detects the environment:

- **Development**: Uses emulator URLs (if configured)
- **Production**: Uses deployed Firebase Functions URLs

To switch between emulator and deployed functions in development, edit `client/src/config/api.js`.

## GitHub Actions (Automatic Deployment)

Firebase init already set up GitHub Actions:

- **PR Builds**: `.github/workflows/firebase-hosting-pull-request.yml`
- **Main Deploys**: `.github/workflows/firebase-hosting-merge.yml`

Commits to `main` branch will automatically deploy to Firebase Hosting.

## Monitoring and Logs

### View Function Logs
```bash
firebase functions:log
```

### View Real-time Logs
```bash
firebase functions:log --follow
```

### Firebase Console
- **Functions**: https://console.firebase.google.com/project/support-alert-system-385b1/functions
- **Hosting**: https://console.firebase.google.com/project/support-alert-system-385b1/hosting

## Cost Considerations

### Firebase Functions (Blaze Plan)
- **Free Tier**: 2M invocations/month, 400K GB-seconds/month
- **Pricing**: $0.40/M invocations, $0.0025/GB-second
- **Estimate**: For typical usage, cost should be under $5/month

### Firebase Hosting
- **Free**: 10GB storage, 10GB/month transfer
- **Overage**: $0.026/GB storage, $0.15/GB transfer

## Troubleshooting

### Function Deployment Issues
1. Ensure Blaze plan is enabled
2. Check `functions/package.json` dependencies
3. Run `firebase functions:log` for errors

### CORS Issues
- Functions already configured with CORS
- If issues persist, check browser dev tools

### Build Issues
```bash
# Clean and rebuild
cd functions && rm -rf node_modules lib && npm install && npm run build
cd ../client && rm -rf node_modules build && npm install && npm run build
```

## Security Notes

1. **Functions are public** - consider adding authentication for production
2. **CORS is open** - restrict origins in production
3. **Rate limiting** - consider adding rate limiting for the HubSpot endpoint

## Next Steps

1. Upgrade to Blaze plan
2. Deploy functions: `firebase deploy --only functions`
3. Deploy hosting: `firebase deploy --only hosting`
4. Test with: `npm run test:firebase`
5. Configure HubSpot webhook URL
