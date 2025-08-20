# Support Alert System - Setup Guide

This guide will help you deploy your own instance of the real-time support alert system with your Firebase project and HubSpot account.

## Prerequisites

- Node.js 18+ installed
- Firebase CLI installed (`npm install -g firebase-tools`)
- A Firebase project
- A HubSpot account with admin access
- A HubSpot private app for API access

## 1. Firebase Project Setup

### Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project"
3. Choose a project name (remember this for later)
4. Enable Google Analytics (optional)
5. Wait for project creation to complete

### Enable Required Services

1. **Firestore Database**:

   - Go to Firestore Database in the left sidebar
   - Click "Create database"
   - Choose "Start in production mode"
   - Select a location close to your users

2. **Firebase Functions**:
   - Go to Functions in the left sidebar
   - Click "Get started" to enable Functions
   - Choose "Pay as you go" billing plan (required for external API calls)

## 2. HubSpot Configuration

### Create a Private App

1. Go to HubSpot Settings → Integrations → Private Apps
2. Click "Create a private app"
3. Give it a name like "Support Alert System"
4. **Required Scopes**:
   - `conversations.read`
   - `conversations.write`
   - `tickets.read`
   - Copy the access token when created

### Find Your Bot Agent IDs

Your bot agent IDs are specific to your HubSpot account. To find them:

1. **Method 1: Webhook Analysis**

   - Deploy the system first with any placeholder bot ID
   - Monitor the Firebase Function logs when conversations are assigned
   - Look for bot agent IDs in the webhook events

2. **Method 2: HubSpot Support**
   - Contact HubSpot support to get your bot/AI agent IDs
   - These might look like "L-67300874" or similar

## 3. Project Configuration

### Clone and Configure

```bash
# Clone or download the project
cd support-alert-system

# Install dependencies
npm install
cd functions && npm install && cd ..
cd client && npm install && cd ..
```

### Environment Configuration

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your configuration
nano .env
```

Fill in your configuration:

```bash
# Your Firebase project ID
REACT_APP_FIREBASE_PROJECT_ID=your-firebase-project-id

# Your HubSpot access token
HUBSPOT_ACCESS_TOKEN=pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Your bot agent IDs (comma-separated)
BOT_AGENT_IDS=L-67300874,your-other-bot-id
```

## 4. Firebase Deployment

### Login and Initialize

```bash
# Login to Firebase
firebase login

# Set your project
firebase use --add
# Select your project and give it an alias like "production"
```

### Configure Firebase Functions Secrets

```bash
# Set HubSpot access token as a secret
firebase functions:secrets:set HUBSPOT_ACCESS_TOKEN
# Enter your HubSpot access token when prompted

# Set bot agent IDs as a secret
firebase functions:secrets:set BOT_AGENT_IDS
# Enter your comma-separated bot IDs when prompted
```

### Deploy Functions

```bash
# Deploy Firebase Functions
firebase deploy --only functions
```

After deployment, note your function URLs. They'll look like:

- `https://us-central1-your-project.cloudfunctions.net/hubspotWebhook`

## 5. HubSpot Webhook Setup

### Create Webhook Subscription

1. Go to HubSpot Settings → Integrations → Webhooks
2. Click "Create subscription"
3. **Configuration**:
   - Target URL: `https://us-central1-your-project.cloudfunctions.net/hubspotWebhook`
   - Object: `Conversations`
   - Properties: `hs_assignee`
   - Request method: `POST`

### Test Webhook

1. Start a test conversation in HubSpot
2. Assign it to different agents
3. Check Firebase Functions logs for webhook events
4. Verify bot agent IDs are being detected correctly

## 6. React Dashboard Deployment

### Configure React App

Update `client/src/config/api.js` if needed:

```javascript
const firebaseConfig = {
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "your-project-id",
  // ... other config
};
```

### Build and Deploy

```bash
# Build the React app
cd client
npm run build

# Deploy to Firebase Hosting
cd ..
firebase deploy --only hosting
```

Your dashboard will be available at: `https://your-project-id.web.app`

## 7. Firestore Security Rules

Update your Firestore security rules to allow the dashboard to read data:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read access to support data and conversations
    match /support_data/{document} {
      allow read: if true;
    }
    match /conversations/{document} {
      allow read: if true;
    }
    match /webhook_events/{document} {
      allow read: if true;
    }
    match /escalations/{document} {
      allow read: if true;
    }

    // Deny all writes from client-side
    match /{document=**} {
      allow write: if false;
    }
  }
}
```

## 8. Testing and Monitoring

### Test the Complete Flow

1. **New Conversation**: Start a conversation in HubSpot
2. **Bot Assignment**: Watch for bot assignment in logs
3. **Human Escalation**: Assign to a human agent
4. **Dashboard Update**: Check dashboard shows escalation
5. **Real-time Updates**: Verify 10-second polling works

### Monitor Performance

- Check Firebase Functions logs for errors
- Monitor Firestore read/write usage
- Watch for webhook delivery failures
- Verify escalation detection accuracy

## 9. Customization Options

### Adjust Polling Frequency

In `client/src/App.js`, change the polling interval:

```javascript
const POLLING_INTERVAL = 10000; // 10 seconds (adjust as needed)
```

### Modify Alert Logic

In `functions/src/scheduler.ts`, customize the escalation detection:

```javascript
// Add custom logic in checkForBotEscalation function
```

### Add New Bot IDs

Update your bot agent IDs anytime:

```bash
firebase functions:secrets:set BOT_AGENT_IDS
# Enter new comma-separated list
firebase deploy --only functions
```

## 10. Troubleshooting

### Common Issues

**Webhook Not Receiving Events**:

- Check HubSpot webhook configuration
- Verify function URL is correct
- Check Firebase Functions logs for errors

**Bot IDs Not Detected**:

- Check Firebase Functions logs for webhook events
- Verify bot agent IDs are correct
- Update BOT_AGENT_IDS secret if needed

**Dashboard Not Updating**:

- Check browser console for errors
- Verify Firestore security rules allow reads
- Check network tab for API call failures

**High Firebase Costs**:

- Reduce dashboard polling frequency
- Optimize Firestore queries
- Monitor function execution time

### Debug Functions

The system includes several debug endpoints:

- `/getEscalationDebugInfo` - View escalation configuration
- `/debugConversationEscalation` - Debug specific conversations
- `/getWebhookActivity` - View recent webhook events

## 11. Production Considerations

### Security

- Keep HubSpot access tokens secure
- Use Firebase Security Rules properly
- Monitor for unauthorized access

### Performance

- Monitor Firebase usage and costs
- Optimize polling frequency for your needs
- Consider caching for high-traffic scenarios

### Maintenance

- Regularly check webhook delivery status
- Monitor for new bot agent IDs
- Update dependencies periodically

## Support

If you encounter issues:

1. Check the Firebase Functions logs first
2. Verify all configuration steps were followed
3. Test webhook delivery manually
4. Check HubSpot webhook subscription status

For additional support, refer to:

- [Firebase Documentation](https://firebase.google.com/docs)
- [HubSpot API Documentation](https://developers.hubspot.com/)
- System logs and debug endpoints

---

**Cost Estimate**: With normal usage (10-50 conversations/day), expect:

- Firebase Functions: $1-5/month
- Firestore: $1-3/month
- Firebase Hosting: Free tier sufficient

The system is designed to be cost-effective while providing real-time support monitoring.
