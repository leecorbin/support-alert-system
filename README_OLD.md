# Support Alert System

A real-time support dashboard that receives webhook events from HubSpot and displays metrics in a React interface.

## Features

- **🔥 Firebase Functions**: Serverless backend with webhook processing
- **⚡ Real-time Updates**: HubSpot webhooks trigger instant dashboard updates
- **📊 React Dashboard**: Live support metrics visualization
- **🗃️ Firestore Storage**: Persistent data storage with real-time syncing
- **🕐 Daily Health Check**: Automated backup sync to ensure data accuracy

## Architecture

**Webhook-Driven Real-time System:**

- HubSpot sends webhook events for tickets/conversations → Firebase Functions process events → Firestore updates → Dashboard reflects changes instantly

## Project Structure

```
support-alert-system/
├── functions/       # Firebase Functions (webhook processing, scheduled tasks)
├── client/          # React dashboard
├── public/          # Firebase Hosting files
├── firestore.rules  # Firestore security rules
└── firebase.json    # Firebase configuration
```

## Quick Start

1. Install dependencies:

   ```bash
   cd functions && npm install
   cd ../client && npm install
   ```

2. Deploy Firebase Functions:

   ```bash
   cd functions && npm run deploy
   ```

3. Start React dashboard locally:

   ```bash
   cd client && npm start
   ```

4. Access the dashboard at `http://localhost:3000`

## Firebase Functions

### Core Functions

- **`hubspotWebhook`**: Processes HubSpot webhook events in real-time
- **`collectSupportData`**: Daily health check and backup sync (9 AM)
- **`getCurrentSupportData`**: Returns current dashboard data from Firestore
- **`getWebhookActivity`**: Returns recent webhook events for monitoring

### Webhook Events Processed

- `ticket.creation` - New support tickets
- `ticket.propertyChange` - Ticket status/pipeline changes
- `conversation.creation` - New chat conversations
- `conversation.propertyChange` - Chat assignments, status changes

## HubSpot Integration

Configure webhook subscriptions in your HubSpot Private App to point to:

```
https://hubspotwebhook-nts4expcga-uc.a.run.app
```

Subscribe to events:

- `ticket.creation`
- `ticket.propertyChange`
- `conversation.creation`
- `conversation.propertyChange`

## Development

- Functions run on Firebase Cloud Functions
- Dashboard connects to Firebase Hosting
- Real-time updates via Firestore
- Webhook processing handles live events
