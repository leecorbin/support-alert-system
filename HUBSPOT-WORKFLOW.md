# HubSpot Workflow Configuration Guide

This guide shows how to set up a HubSpot workflow that automatically sends support data to your Firebase webhook.

## Prerequisites

- HubSpot Professional or Enterprise account (workflows require paid plan)
- Admin access to HubSpot
- Support tickets and live chat data in HubSpot

## Method 1: HubSpot Workflow (Recommended)

### Step 1: Create a Custom Workflow

1. **Go to Automation** → **Workflows** → **Create workflow**
2. **Choose "From scratch"** → **Contact-based** or **Deal-based**
3. **Name**: "Support Alert System Data Sync"

### Step 2: Set Enrollment Triggers

Choose one of these trigger strategies:

#### Option A: Time-based (Every 5 minutes)

- **Trigger**: "When a date property is known"
- **Property**: "Create date"
- **Re-enrollment**: Allow contacts to re-enroll
- **Suppression**: None
- **Add delay**: 5 minutes, then re-enroll

#### Option B: Ticket-based (Real-time)

- **Trigger**: "When ticket is updated"
- **Criteria**: Any ticket property changes
- **Re-enrollment**: Yes

### Step 3: Add Webhook Action

1. **Add action** → **Send webhook**
2. **Webhook URL**:
   ```
   https://us-central1-support-alert-system-385b1.cloudfunctions.net/support
   ```
3. **Method**: POST
4. **Headers**:
   ```
   Content-Type: application/json
   ```

### Step 4: Configure Webhook Payload

You'll need to use HubSpot's custom code action to format the data properly:

```javascript
// Custom code action to format support data
const hubspot = require("@hubspot/api-client");

exports.main = async (event, callback) => {
  const hubspotClient = new hubspot.Client({
    accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
  });

  try {
    // Get ticket counts
    const ticketsResponse = await hubspotClient.crm.tickets.searchApi.doSearch({
      filterGroups: [
        {
          filters: [
            {
              propertyName: "hs_pipeline_stage",
              operator: "IN",
              values: ["1", "2", "3"], // Open ticket stage IDs
            },
          ],
        },
      ],
      properties: ["hs_pipeline_stage", "source_type"],
      limit: 100,
    });

    // Count tickets by type
    let openTickets = 0;
    let chatTickets = 0;
    let emailTickets = 0;

    ticketsResponse.results.forEach((ticket) => {
      openTickets++;
      if (ticket.properties.source_type === "CHAT") {
        chatTickets++;
      } else if (ticket.properties.source_type === "EMAIL") {
        emailTickets++;
      }
    });

    // Get live chat sessions (you'll need to adjust based on your setup)
    // This is a simplified example - adjust based on your HubSpot configuration
    const liveSessions = 2; // Get from your chat platform API
    const humanAgents = 1; // Get from your agent availability system

    // Prepare webhook payload
    const payload = {
      tickets: {
        open: openTickets,
        chat: chatTickets,
        email: emailTickets,
      },
      sessions: {
        live: liveSessions,
        human: humanAgents,
      },
    };

    // Send to webhook
    const fetch = require("node-fetch");
    const response = await fetch(
      "https://us-central1-support-alert-system-385b1.cloudfunctions.net/support",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const result = await response.json();
    console.log("Webhook response:", result);

    callback({
      outputFields: {
        webhookResponse: JSON.stringify(result),
      },
    });
  } catch (error) {
    console.error("Error:", error);
    callback(error);
  }
};
```

## Method 2: Zapier Integration (Easier Setup)

If HubSpot workflows are complex, use Zapier:

### Step 1: Create Zapier Zap

1. **Trigger**: HubSpot - "New Ticket" or "Updated Ticket"
2. **Action**: Webhooks - "POST"

### Step 2: Configure Webhook

- **URL**: `https://us-central1-support-alert-system-385b1.cloudfunctions.net/support`
- **Payload Type**: JSON
- **Data**:

```json
{
  "tickets": {
    "open": {{ticket_count_formula}},
    "chat": {{chat_ticket_count}},
    "email": {{email_ticket_count}}
  },
  "sessions": {
    "live": {{live_sessions}},
    "human": {{human_agents}}
  }
}
```

## Method 3: Custom Script (Advanced)

For more control, create a custom script that runs on a schedule:

### Node.js Script Example

```javascript
const hubspot = require("@hubspot/api-client");
const axios = require("axios");

const hubspotClient = new hubspot.Client({
  accessToken: "your-hubspot-access-token",
});

async function getSupportData() {
  try {
    // Get tickets
    const tickets = await hubspotClient.crm.tickets.searchApi.doSearch({
      filterGroups: [
        {
          filters: [
            {
              propertyName: "hs_pipeline_stage",
              operator: "IN",
              values: ["open", "in_progress"],
            },
          ],
        },
      ],
      properties: ["source_type", "hs_pipeline_stage"],
      limit: 100,
    });

    // Count by type
    const ticketCounts = {
      open: tickets.results.length,
      chat: tickets.results.filter((t) => t.properties.source_type === "CHAT")
        .length,
      email: tickets.results.filter((t) => t.properties.source_type === "EMAIL")
        .length,
    };

    // Get session data (integrate with your chat platform)
    const sessionData = {
      live: await getLiveSessionCount(),
      human: await getHumanAgentCount(),
    };

    // Send to webhook
    const payload = {
      tickets: ticketCounts,
      sessions: sessionData,
    };

    const response = await axios.post(
      "https://us-central1-support-alert-system-385b1.cloudfunctions.net/support",
      payload
    );

    console.log("Data sent successfully:", response.data);
  } catch (error) {
    console.error("Error:", error);
  }
}

// Run every 5 minutes
setInterval(getSupportData, 5 * 60 * 1000);
```

## Method 4: Make.com (Integromat)

1. **Create scenario** with HubSpot trigger
2. **Add HTTP module** with your webhook URL
3. **Map data fields** to match the required JSON structure

## Testing Your Workflow

Use this curl command to test your webhook is working:

```bash
curl -X POST https://us-central1-support-alert-system-385b1.cloudfunctions.net/support \
  -H "Content-Type: application/json" \
  -d '{
    "tickets": {
      "open": 5,
      "chat": 3,
      "email": 2
    },
    "sessions": {
      "live": 4,
      "human": 2
    }
  }'
```

## Data Sources You'll Need

To populate the webhook data, you'll need access to:

1. **Ticket Counts**:

   - Open tickets in HubSpot
   - Chat-sourced tickets
   - Email-sourced tickets

2. **Session Data**:

   - Live chat sessions (from your chat platform API)
   - Available human agents (from your staffing system)

3. **APIs to Integrate**:
   - HubSpot API (for tickets)
   - Live chat platform API (Intercom, Zendesk Chat, etc.)
   - Internal staffing/scheduling system

## Recommended Approach

For most setups, I recommend **Method 2 (Zapier)** because:

- Easy to set up and maintain
- No coding required
- Good error handling
- Can handle multiple data sources
- Cost-effective for moderate volume

Would you like me to help you set up any of these specific methods?
