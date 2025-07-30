#!/usr/bin/env node

/**
 * Support Data Workflow Script
 *
 * This script collects support data from various sources and sends it to your Firebase webhook.
 * You can run this on a schedule (cron job) or as a continuous process.
 */

const axios = require("axios");

// Configuration
const CONFIG = {
  // Your Firebase webhook URL
  WEBHOOK_URL:
    "https://us-central1-support-alert-system-385b1.cloudfunctions.net/support",

  // Update interval (in milliseconds) - Firebase Functions can handle frequent calls
  UPDATE_INTERVAL: 15 * 1000, // 15 seconds for near real-time

  // Cache duration for external API calls (HubSpot/Zendesk cost money, Firebase doesn't)
  CACHE_DURATION: 60 * 1000, // 1 minute cache for external APIs

  // HubSpot configuration (if using HubSpot API)
  HUBSPOT_ACCESS_TOKEN: process.env.HUBSPOT_ACCESS_TOKEN || "",

  // Zendesk configuration (if using Zendesk API)
  ZENDESK_SUBDOMAIN: process.env.ZENDESK_SUBDOMAIN || "",
  ZENDESK_EMAIL: process.env.ZENDESK_EMAIL || "",
  ZENDESK_TOKEN: process.env.ZENDESK_TOKEN || "",

  // Intercom configuration (if using Intercom API)
  INTERCOM_ACCESS_TOKEN: process.env.INTERCOM_ACCESS_TOKEN || "",
};

// Simple cache to avoid excessive API calls
let dataCache = {
  data: null,
  timestamp: 0,
  isValid() {
    return this.data && Date.now() - this.timestamp < CONFIG.CACHE_DURATION;
  },
  set(data) {
    this.data = data;
    this.timestamp = Date.now();
  },
};

/**
 * Example: Get support data from HubSpot
 */
async function getHubSpotData() {
  if (!CONFIG.HUBSPOT_ACCESS_TOKEN) {
    console.log("⚠️  HubSpot token not configured, using mock data");
    return getMockData();
  }

  try {
    const hubspot = require("@hubspot/api-client");
    const hubspotClient = new hubspot.Client({
      accessToken: CONFIG.HUBSPOT_ACCESS_TOKEN,
    });

    // Get open tickets
    const ticketsResponse = await hubspotClient.crm.tickets.searchApi.doSearch({
      filterGroups: [
        {
          filters: [
            {
              propertyName: "hs_pipeline_stage",
              operator: "IN",
              values: ["1", "2", "3"], // Replace with your open ticket stage IDs
            },
          ],
        },
      ],
      properties: ["source_type", "hs_pipeline_stage"],
      limit: 100,
    });

    // Count tickets by type
    let openTickets = ticketsResponse.results.length;
    let chatTickets = ticketsResponse.results.filter(
      (t) => t.properties.source_type === "CHAT"
    ).length;
    let emailTickets = ticketsResponse.results.filter(
      (t) => t.properties.source_type === "EMAIL"
    ).length;

    return {
      tickets: {
        open: openTickets,
        chat: chatTickets,
        email: emailTickets,
      },
      sessions: {
        live: await getLiveSessionCount(),
        human: await getHumanAgentCount(),
      },
    };
  } catch (error) {
    console.error("❌ Error fetching HubSpot data:", error.message);
    return getMockData();
  }
}

/**
 * Example: Get support data from Zendesk
 */
async function getZendeskData() {
  if (
    !CONFIG.ZENDESK_SUBDOMAIN ||
    !CONFIG.ZENDESK_EMAIL ||
    !CONFIG.ZENDESK_TOKEN
  ) {
    console.log("⚠️  Zendesk credentials not configured, using mock data");
    return getMockData();
  }

  try {
    const auth = Buffer.from(
      `${CONFIG.ZENDESK_EMAIL}/token:${CONFIG.ZENDESK_TOKEN}`
    ).toString("base64");

    // Get tickets
    const response = await axios.get(
      `https://${CONFIG.ZENDESK_SUBDOMAIN}.zendesk.com/api/v2/tickets.json?status=open&status=pending`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
      }
    );

    const tickets = response.data.tickets;

    // Count by channel
    let chatTickets = tickets.filter((t) => t.via?.channel === "chat").length;
    let emailTickets = tickets.filter((t) => t.via?.channel === "email").length;

    return {
      tickets: {
        open: tickets.length,
        chat: chatTickets,
        email: emailTickets,
      },
      sessions: {
        live: await getLiveSessionCount(),
        human: await getHumanAgentCount(),
      },
    };
  } catch (error) {
    console.error("❌ Error fetching Zendesk data:", error.message);
    return getMockData();
  }
}

/**
 * Get live session count (customize based on your chat platform)
 */
async function getLiveSessionCount() {
  // Example: Intercom API
  if (CONFIG.INTERCOM_ACCESS_TOKEN) {
    try {
      const response = await axios.get(
        "https://api.intercom.io/conversations",
        {
          headers: {
            Authorization: `Bearer ${CONFIG.INTERCOM_ACCESS_TOKEN}`,
            Accept: "application/json",
          },
          params: {
            state: "open",
          },
        }
      );
      return response.data.conversations?.length || 0;
    } catch (error) {
      console.error("❌ Error fetching live sessions:", error.message);
    }
  }

  // Default: random number for demo
  return Math.floor(Math.random() * 10) + 1;
}

/**
 * Get human agent count (customize based on your system)
 */
async function getHumanAgentCount() {
  // Example: You might integrate with your HR system, Slack presence, etc.
  // For now, return a simulated count
  const businessHours =
    new Date().getHours() >= 9 && new Date().getHours() <= 17;
  return businessHours ? Math.floor(Math.random() * 5) + 2 : 1;
}

/**
 * Generate mock data for testing
 */
function getMockData() {
  return {
    tickets: {
      open: Math.floor(Math.random() * 20) + 5,
      chat: Math.floor(Math.random() * 10) + 2,
      email: Math.floor(Math.random() * 15) + 3,
    },
    sessions: {
      live: Math.floor(Math.random() * 8) + 1,
      human: Math.floor(Math.random() * 5) + 1,
    },
  };
}

/**
 * Send data to Firebase webhook
 */
async function sendToWebhook(data) {
  try {
    console.log("📊 Sending support data:", JSON.stringify(data, null, 2));

    const response = await axios.post(CONFIG.WEBHOOK_URL, data, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log("✅ Data sent successfully:", response.data.message);
    console.log("📈 Updated dashboard data at:", new Date().toISOString());
  } catch (error) {
    console.error(
      "❌ Error sending to webhook:",
      error.response?.data || error.message
    );
  }
}

/**
 * Main workflow function with caching
 */
async function runWorkflow() {
  console.log("\n🚀 Running support data workflow...");

  try {
    let data;

    // Use cached data if available and fresh
    if (dataCache.isValid()) {
      console.log("📦 Using cached data (avoiding API call)");
      data = dataCache.data;
    } else {
      console.log("🔄 Fetching fresh data from API");

      // Choose your data source (uncomment the one you want to use)

      // Option 1: HubSpot
      // data = await getHubSpotData();

      // Option 2: Zendesk
      // data = await getZendeskData();

      // Option 3: Mock data for testing
      data = getMockData();

      // Cache the fresh data
      dataCache.set(data);
    }

    // Send to webhook (this is cheap - just HTTP call to your own Firebase)
    await sendToWebhook(data);
  } catch (error) {
    console.error("❌ Workflow error:", error);
  }
}

/**
 * Start the workflow
 */
async function start() {
  console.log("🎯 Support Data Workflow Started");
  console.log("📡 Webhook URL:", CONFIG.WEBHOOK_URL);
  console.log("⏰ Update interval:", CONFIG.UPDATE_INTERVAL / 1000, "seconds");
  console.log("💡 Dashboard URL: https://support-alert-system-385b1.web.app");

  // Run immediately
  await runWorkflow();

  // Then run on interval
  setInterval(runWorkflow, CONFIG.UPDATE_INTERVAL);

  console.log("\n✨ Workflow is running... Press Ctrl+C to stop");
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Stopping workflow...");
  process.exit(0);
});

// Error handling
process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled rejection:", error);
});

// Start if this file is run directly
if (require.main === module) {
  start();
}

module.exports = {
  runWorkflow,
  getHubSpotData,
  getZendeskData,
  getMockData,
  sendToWebhook,
};
