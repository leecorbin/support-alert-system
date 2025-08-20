# Real-Time Support Alert System

A comprehensive real-time support monitoring system that detects new conversations and escalations from chatbots to human agents, providing immediate notifications and a live dashboard.

## ✨ Features

- **Real-Time Escalation Detection**: Instantly detects when conversations are escalated from bots to human agents
- **Live Dashboard**: React-based dashboard with 10-second polling and dynamic visual indicators
- **HubSpot Integration**: Complete webhook-based integration with HubSpot conversations
- **Cost-Optimized**: Efficient polling and Firebase usage to minimize costs
- **Visual Status Indicators**: Dynamic background gradients based on support activity
- **Comprehensive Logging**: Detailed logs for debugging and monitoring
- **Configurable**: Environment-based configuration for easy deployment

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Firebase CLI
- Firebase project with Firestore and Functions enabled
- HubSpot account with private app access

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd support-alert-system

# Install dependencies
npm install
cd functions && npm install && cd ..
cd client && npm install && cd ..

# Configure environment
cp .env.example .env
# Edit .env with your configuration
```

### Configuration

1. **Firebase Project**: Set your project ID in `.env`
2. **HubSpot Access Token**: Add your private app token
3. **Bot Agent IDs**: Configure your bot/AI agent IDs
4. **Deploy**: Follow the setup guide for complete deployment

📖 **[Complete Setup Guide](./SETUP_GUIDE.md)** - Detailed step-by-step instructions

## 🏗️ Architecture

### Components

- **Firebase Functions**: Webhook processing and escalation detection
- **React Dashboard**: Real-time monitoring interface
- **Firestore Database**: Conversation and event storage
- **HubSpot Webhooks**: Real-time conversation event streaming

### Data Flow

1. HubSpot sends webhook events for conversation assignments
2. Firebase Functions process events and detect bot-to-human escalations
3. Events stored in Firestore with proper indexing
4. React dashboard polls Firestore every 10 seconds
5. Visual indicators update based on current support status

## 📊 Dashboard Features

### Real-Time Metrics

- **Active Conversations**: Live count of ongoing chats
- **Escalated Sessions**: Conversations escalated to humans
- **New Chat Alerts**: Immediate notification of new conversations
- **Response Time Tracking**: Monitor escalation detection speed

### Visual Indicators

- **Green Gradient**: No active escalations
- **Orange/Red Gradient**: Active escalations requiring attention
- **Enhanced Timestamps**: Human-readable time formatting
- **Status Cards**: Clear visual summary of current state

## 🔧 Configuration

### Environment Variables

```bash
# Firebase Configuration
REACT_APP_FIREBASE_PROJECT_ID=your-firebase-project

# HubSpot Integration (Firebase Secrets)
HUBSPOT_ACCESS_TOKEN=pat-na1-xxxxxxxxxxxx
BOT_AGENT_IDS=L-67300874,other-bot-id
```

### Bot Agent ID Discovery

Your bot agent IDs are unique to your HubSpot account. Find them by:

1. Monitoring webhook events in Firebase logs
2. Looking for agent IDs when conversations start with bots
3. Contacting HubSpot support for your specific bot IDs

## 🛠️ Development

### Local Development

```bash
# Start Firebase emulators
firebase emulators:start

# Start React development server
cd client && npm start
```

### Testing

```bash
# Test webhook processing
curl -X POST https://your-function-url/hubspotWebhook \
  -H "Content-Type: application/json" \
  -d '[{"subscriptionType":"conversation.assignment","objectId":123,"propertyValue":"L-67300874"}]'
```

### Debug Endpoints

- `/getEscalationDebugInfo` - Configuration and recent activity
- `/debugConversationEscalation` - Specific conversation analysis
- `/getWebhookActivity` - Recent webhook events
- `/manualEscalationProcess` - Manual escalation processing

## 📈 Performance & Costs

### Optimization

- **10-second polling** for real-time feel with cost efficiency
- **Composite Firestore indexes** for fast queries
- **Efficient webhook processing** with minimal function execution time
- **Strategic data caching** to reduce read operations

### Expected Costs (Monthly)

- **Firebase Functions**: $1-5 (normal usage)
- **Firestore**: $1-3 (10-50 conversations/day)
- **Firebase Hosting**: Free tier sufficient
- **Total**: $2-8/month for small to medium support teams

## 🔒 Security

### Access Control

- **Firebase Security Rules**: Read-only access from dashboard
- **Function-only Writes**: All data modifications through Functions
- **Secrets Management**: HubSpot tokens stored as Firebase secrets
- **Environment Variables**: No hardcoded sensitive data

### Best Practices

- Regular token rotation
- Monitor for unauthorized access
- Secure webhook endpoints
- Audit logs for debugging

## 🚨 Troubleshooting

### Common Issues

1. **Webhook Not Working**: Check HubSpot subscription and function URL
2. **Bot IDs Not Detected**: Verify bot agent ID configuration
3. **Dashboard Not Updating**: Check Firestore security rules
4. **High Costs**: Reduce polling frequency or optimize queries

### Monitoring

- Firebase Functions logs for webhook processing
- Firestore usage metrics for cost optimization
- HubSpot webhook delivery status
- Dashboard network requests for client issues

## 🤝 Contributing

This system is designed to be easily customizable for different support workflows:

1. **Fork the repository**
2. **Configure for your environment**
3. **Customize escalation logic as needed**
4. **Share improvements with the community**

## 📝 License

This project is designed for sharing and customization. See individual files for specific configurations.

## 🆘 Support

1. **Check the [Setup Guide](./SETUP_GUIDE.md)** for detailed instructions
2. **Review Firebase Functions logs** for webhook processing issues
3. **Test webhook delivery** using HubSpot's webhook testing tools
4. **Monitor Firestore usage** for performance optimization

---

**Built with**: Firebase Functions v2, React 18, HubSpot Webhooks, Firestore

**Response Time**: Typically detects escalations within 10-30 seconds of occurrence

**Scalability**: Designed for small to medium support teams (10-100 conversations/day)
