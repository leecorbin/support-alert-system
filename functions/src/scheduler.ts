import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import axios from "axios";

// Define the secret
const hubspotAccessToken = defineSecret("HUBSPOT_ACCESS_TOKEN");

// Initialize Firebase Admin
initializeApp();
const db = getFirestore();

// Support data interface
interface SupportData {
  tickets: {
    open: number;
    chat: number;
    email: number;
  };
  sessions: {
    active: number; // Currently active chat sessions
    escalated: number; // Sessions escalated from AI to human
  };
  lastUpdated: string;
  source: string;
}

// HubSpot API interfaces
interface HubSpotTicket {
  properties: {
    source_type: string;
    hs_pipeline_stage: string;
  };
}

interface HubSpotThread {
  status: string;
  originalChannelId: string;
}

interface WebhookEvent {
  subscriptionType: string;
  propertyName?: string;
  propertyValue?: string;
  objectId: string;
  changeFlag?: string;
}

// Configuration
const CONFIG = {
  // HubSpot Support Pipeline stage IDs for "open" tickets
  // Support Pipeline (ID: 0) open stages:
  // "1" = New, "2" = Waiting on contact, "3" = Waiting on us
  // Excludes "4" = Closed
  OPEN_TICKET_STAGES: ["1", "2", "3"],
};

/**
 * Get support data from HubSpot
 * @param {string} token - HubSpot access token
 * @return {Promise<SupportData>} Support data from HubSpot
 */
async function getHubSpotData(token: string): Promise<SupportData> {
  if (!token) {
    logger.warn("HubSpot token not configured, using mock data");
    return getMockData("hubspot-mock");
  }

  try {
    // Using HubSpot REST API to search for tickets
    const response = await axios.post(
      "https://api.hubapi.com/crm/v3/objects/tickets/search",
      {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "hs_pipeline_stage",
                operator: "IN",
                values: CONFIG.OPEN_TICKET_STAGES,
              },
            ],
          },
        ],
        properties: ["source_type", "hs_pipeline_stage"],
        limit: 100,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const tickets = response.data.results;
    const openTickets = tickets.length;
    const chatTickets = tickets.filter(
      (t: HubSpotTicket) => t.properties.source_type === "CHAT"
    ).length;
    const emailTickets = tickets.filter(
      (t: HubSpotTicket) => t.properties.source_type === "EMAIL"
    ).length;

    return {
      tickets: {
        open: openTickets,
        chat: chatTickets,
        email: emailTickets,
      },
      sessions: {
        active: await getActiveChatSessionsFromHubSpot(token),
        escalated: await getEscalatedSessions(), // Real count from hooks
      },
      lastUpdated: new Date().toISOString(),
      source: "hubspot",
    };
  } catch (error) {
    logger.error("Error fetching HubSpot data:", error);
    return getMockData("hubspot-error");
  }
}

/**
 * Get active chat sessions from HubSpot Conversations API
 * @param {string} token - HubSpot access token
 * @return {Promise<number>} Number of active chat sessions
 */
async function getActiveChatSessionsFromHubSpot(
  token: string
): Promise<number> {
  try {
    // Fetch threads from HubSpot Conversations API
    const response = await axios.get(
      "https://api.hubapi.com/conversations/v3/conversations/threads",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        params: {
          limit: 100,
          // You can filter by channelType if needed
          // channelType: 'CHAT',
        },
      }
    );
    // Filter for active chat threads
    const threads = response.data.results || [];
    logger.info(
      "HubSpot Conversations API threads:",
      JSON.stringify(threads, null, 2)
    );
    // Only count threads that are Live Chat and currently open
    // Live Chat channelId is "1000" (from user-provided mapping)
    const activeChats = threads.filter((thread: HubSpotThread) => {
      return thread.status === "OPEN" && thread.originalChannelId === "1000";
    });
    logger.info("Filtered active chat sessions:", activeChats.length);
    return activeChats.length;
  } catch (error) {
    logger.error("Error fetching active chat sessions from HubSpot:", error);
    return 0;
  }
}

/**
 * Get sessions escalated to human agents
 */
async function getEscalatedSessions(): Promise<number> {
  try {
    // Get current escalated count from Firestore
    const doc = await db.collection("support").doc("current").get();

    if (doc.exists) {
      const currentData = doc.data() as SupportData;
      return currentData.sessions?.escalated || 0;
    }

    // If no data exists yet, return 0
    return 0;
  } catch (error) {
    logger.error("Error getting escalated sessions count:", error);
    // Fallback to business hours simulation if there's an error
    const businessHours =
      new Date().getHours() >= 9 && new Date().getHours() <= 17;
    return businessHours ? Math.floor(Math.random() * 3) : 0;
  }
}

/**
 * Generate mock data
 * @param {string} source - Source identifier for the mock data
 * @return {SupportData} Mock support data
 */
function getMockData(source: string): SupportData {
  return {
    tickets: {
      open: Math.floor(Math.random() * 20) + 5,
      chat: Math.floor(Math.random() * 10) + 2,
      email: Math.floor(Math.random() * 15) + 3,
    },
    sessions: {
      active: Math.floor(Math.random() * 5) + 1,
      escalated: Math.floor(Math.random() * 2),
    },
    lastUpdated: new Date().toISOString(),
    source,
  };
}

/**
 * Store data in Firestore
 * @param {SupportData} data - Support data to store
 * @return {Promise<void>} Promise that resolves when data is stored
 */
async function storeSupportData(data: SupportData): Promise<void> {
  try {
    await db.collection("support").doc("current").set(data);
    logger.info("Support data stored successfully", { source: data.source });
  } catch (error) {
    logger.error("Error storing support data:", error);
    throw error;
  }
}

// Daily health check - ensures system is working and provides baseline sync
export const collectSupportData = onSchedule(
  {
    schedule: "every day 09:00", // Once daily at 9 AM
    secrets: [hubspotAccessToken],
  },
  async () => {
    logger.info("Starting daily health check and baseline sync");

    try {
      let data: SupportData;

      // Use HubSpot if token is available, otherwise use mock data
      const token = hubspotAccessToken.value();
      if (token) {
        data = await getHubSpotData(token);
        data.source = "daily-health-check";
      } else {
        data = getMockData("health-check-mock");
        logger.warn("No HubSpot token configured, using mock data");
      }

      // Store in Firestore
      await storeSupportData(data);

      // Log webhook activity summary for the last 24 hours
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const webhookCount = await db
        .collection("webhook-events")
        .where("timestamp", ">=", yesterday.toISOString())
        .count()
        .get();

      logger.info("Daily health check completed", {
        tickets: data.tickets,
        sessions: data.sessions,
        webhooksLast24h: webhookCount.data().count,
        source: data.source,
      });
    } catch (error) {
      logger.error("Error in daily health check:", error);
    }
  }
);

// HTTP function to manually trigger data collection
export const triggerSupportDataCollection = onRequest(
  {
    cors: true,
    secrets: [hubspotAccessToken],
  },
  async (req, res) => {
    try {
      logger.info("Manual support data collection triggered");

      let data: SupportData;

      // Use HubSpot if token is available, otherwise use mock data
      const token = hubspotAccessToken.value();
      if (token) {
        data = await getHubSpotData(token);
      } else {
        data = getMockData("manual-trigger");
        logger.warn("No HubSpot token configured, using mock data");
      }

      await storeSupportData(data);

      res.json({
        success: true,
        message: "Support data collected and stored successfully",
        data,
      });
    } catch (error) {
      logger.error("Error in manual data collection:", error);
      res.status(500).json({
        success: false,
        message: "Error collecting support data",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// HTTP function to get current support data from Firestore
export const getCurrentSupportData = onRequest(
  { cors: true },
  async (req, res) => {
    try {
      const doc = await db.collection("support").doc("current").get();

      if (!doc.exists) {
        res.status(404).json({
          success: false,
          message: "No support data found",
        });
        return;
      }

      const data = doc.data() as SupportData;

      res.json({
        success: true,
        data,
        message: "Current support data retrieved successfully",
      });
    } catch (error) {
      logger.error("Error retrieving support data:", error);
      res.status(500).json({
        success: false,
        message: "Error retrieving support data",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// HTTP function to get recent webhook activity for monitoring
export const getWebhookActivity = onRequest(
  { cors: true },
  async (req, res) => {
    try {
      // Get recent webhook events from Firestore
      const recentEvents = await db
        .collection("webhook-events")
        .orderBy("timestamp", "desc")
        .limit(10)
        .get();

      const events = recentEvents.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      res.json({
        success: true,
        events,
        message: "Recent webhook activity retrieved successfully",
      });
    } catch (error) {
      logger.error("Error retrieving webhook activity:", error);
      res.status(500).json({
        success: false,
        message: "Error retrieving webhook activity",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// HTTP function to handle HubSpot webhook events
export const hubspotWebhook = onRequest(
  {
    cors: true,
    secrets: [hubspotAccessToken],
  },
  async (req, res) => {
    try {
      logger.info("HubSpot webhook received", {
        method: req.method,
        headers: req.headers,
        body: req.body,
        query: req.query,
      });

      // Log the raw payload for debugging
      logger.info(
        "HubSpot webhook payload:",
        JSON.stringify(req.body, null, 2)
      );

      // Respond quickly to HubSpot to acknowledge receipt
      res.status(200).json({
        success: true,
        message: "Webhook received and processed",
        timestamp: new Date().toISOString(),
      });

      // Process webhook events
      const events = Array.isArray(req.body) ? req.body : [req.body];

      for (const event of events) {
        await processWebhookEvent(event);
      }
    } catch (error) {
      logger.error("Error processing HubSpot webhook:", error);
      res.status(500).json({
        success: false,
        message: "Error processing webhook",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

/**
 * Process individual webhook events and update dashboard data
 * @param {WebhookEvent} event - Webhook event to process
 * @return {Promise<void>} Promise that resolves when event is processed
 */
async function processWebhookEvent(event: WebhookEvent): Promise<void> {
  try {
    const {
      subscriptionType,
      propertyName,
      propertyValue,
      objectId,
      changeFlag,
    } = event;

    logger.info("Processing webhook event", {
      subscriptionType,
      propertyName,
      propertyValue,
      objectId,
      changeFlag,
    });

    // Store webhook event for monitoring
    await storeWebhookEvent(event);

    // Handle ticket events
    if (
      subscriptionType === "ticket.creation" ||
      (subscriptionType === "ticket.propertyChange" &&
        propertyName === "hs_pipeline_stage")
    ) {
      await handleTicketEvent();
    }

    // Handle conversation events
    if (
      subscriptionType === "conversation.creation" ||
      subscriptionType === "conversation.propertyChange"
    ) {
      await handleConversationEvent(event);
    }
  } catch (error) {
    logger.error("Error processing webhook event:", error);
  }
}

/**
 * Store webhook event for monitoring and debugging
 * @param {WebhookEvent} event - Webhook event to store
 * @return {Promise<void>} Promise that resolves when event is stored
 */
async function storeWebhookEvent(event: WebhookEvent): Promise<void> {
  try {
    await db.collection("webhook-events").add({
      ...event,
      timestamp: new Date().toISOString(),
      processed: true,
    });
  } catch (error) {
    logger.error("Error storing webhook event:", error);
  }
}

/**
 * Handle ticket-related webhook events
 * @return {Promise<void>} Promise that resolves when event is handled
 */
async function handleTicketEvent(): Promise<void> {
  try {
    logger.info("Handling ticket event - triggering full data refresh");

    // For ticket events, trigger a full data collection
    // This ensures accurate counts since we need to aggregate all tickets
    const token = hubspotAccessToken.value();
    if (token) {
      const data = await getHubSpotData(token);
      await storeSupportData(data);
      logger.info("Dashboard data updated from ticket event", {
        tickets: data.tickets,
        sessions: data.sessions,
      });
    }
  } catch (error) {
    logger.error("Error handling ticket event:", error);
  }
}

/**
 * Handle conversation-related webhook events
 * @param {WebhookEvent} event - Webhook event to process
 * @return {Promise<void>} Promise that resolves when event is handled
 */
async function handleConversationEvent(event: WebhookEvent): Promise<void> {
  try {
    const { subscriptionType, propertyName, propertyValue, objectId } = event;

    logger.info("Handling conversation event", {
      subscriptionType,
      propertyName,
      propertyValue,
      objectId,
    });

    // Track conversation status changes for active sessions
    if (propertyName === "status") {
      logger.info("Conversation status changed", {
        conversationId: objectId,
        newStatus: propertyValue,
      });
    }

    // Track assignment changes (AI to human escalation)
    if (propertyName === "assignedTo") {
      logger.info("Conversation assignment changed", {
        conversationId: objectId,
        assignedTo: propertyValue,
      });

      // Check if this is an escalation from AI to human
      // Human agent IDs typically start with letters (A-, L-, etc.)
      // while bots might have different patterns
      if (
        propertyValue &&
        typeof propertyValue === "string" &&
        (propertyValue.startsWith("A-") ||
          propertyValue.startsWith("L-") ||
          propertyValue.startsWith("B-"))
      ) {
        await incrementEscalatedSessions();
      }
    }

    // For conversation events, trigger a full data refresh for counts
    const token = hubspotAccessToken.value();
    if (token) {
      const data = await getHubSpotData(token);
      await storeSupportData(data);
      logger.info("Dashboard data updated from conversation event", {
        tickets: data.tickets,
        sessions: data.sessions,
      });
    }
  } catch (error) {
    logger.error("Error handling conversation event:", error);
  }
}

/**
 * Increment escalated sessions counter
 */
async function incrementEscalatedSessions(): Promise<void> {
  try {
    // Get current data
    const doc = await db.collection("support").doc("current").get();

    if (doc.exists) {
      const currentData = doc.data() as SupportData;

      // Increment escalated sessions
      const updatedData: SupportData = {
        ...currentData,
        sessions: {
          ...currentData.sessions,
          escalated: currentData.sessions.escalated + 1,
        },
        lastUpdated: new Date().toISOString(),
        source: "webhook-escalation",
      };

      await db.collection("support").doc("current").set(updatedData);
      logger.info("Escalated sessions incremented", {
        previousCount: currentData.sessions.escalated,
        newCount: updatedData.sessions.escalated,
      });
    }
  } catch (error) {
    logger.error("Error incrementing escalated sessions:", error);
  }
}
