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

  // Known bot/AI agent IDs in HubSpot
  // Add your actual bot IDs here - these are the IDs that conversations
  // start with before being escalated to humans
  BOT_AGENT_IDS: [
    "L-67300874", // Discovered from webhook analysis - HubSpot bot/AI agent
    // Add additional bot IDs here as discovered:
    // "bot-12345",
    // "chatbot-ai",
    // "automated-agent-001"
  ] as string[],
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

// HTTP function to get escalation debug info
export const getEscalationDebugInfo = onRequest(
  { cors: true },
  async (req, res) => {
    try {
      // Get recent conversation assignments for debugging
      const recentConversations = await db
        .collection("conversations")
        .orderBy("lastUpdated", "desc")
        .limit(20)
        .get();

      const conversations = recentConversations.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Get configuration info
      const config = {
        botAgentIds: CONFIG.BOT_AGENT_IDS,
        botAgentIdsConfigured: CONFIG.BOT_AGENT_IDS.length > 0,
      };

      res.json({
        success: true,
        config,
        recentConversations: conversations,
        message: "Escalation debug info retrieved successfully",
      });
    } catch (error) {
      logger.error("Error retrieving escalation debug info:", error);
      res.status(500).json({
        success: false,
        message: "Error retrieving escalation debug info",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// HTTP function to get stored webhook payloads for debugging
export const getWebhookPayloads = onRequest(
  { cors: true },
  async (req, res) => {
    try {
      // Get recent webhook payloads
      const limit = parseInt(req.query.limit as string) || 20;
      const recentPayloads = await db
        .collection("webhook-payloads")
        .orderBy("timestamp", "desc")
        .limit(Math.min(limit, 100)) // Cap at 100 to avoid large responses
        .get();

      const payloads = recentPayloads.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      res.json({
        success: true,
        payloads,
        count: payloads.length,
        message: "Webhook payloads retrieved successfully",
      });
    } catch (error) {
      logger.error("Error retrieving webhook payloads:", error);
      res.status(500).json({
        success: false,
        message: "Error retrieving webhook payloads",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// HTTP function to reset escalation counts to zero
export const resetEscalations = onRequest({ cors: true }, async (req, res) => {
  try {
    // Get current data
    const doc = await db.collection("support").doc("current").get();

    if (doc.exists) {
      const currentData = doc.data() as SupportData;
      const updatedData: SupportData = {
        ...currentData,
        sessions: {
          ...currentData.sessions,
          escalated: 0,
        },
        lastUpdated: new Date().toISOString(),
        source: "manual-reset",
      };

      await db.collection("support").doc("current").set(updatedData);

      res.json({
        success: true,
        message: "Escalation count reset to zero",
        previousCount: currentData.sessions.escalated,
        newCount: 0,
      });
    } else {
      res.status(404).json({
        success: false,
        message: "No support data found to reset",
      });
    }
  } catch (error) {
    logger.error("Error resetting escalations:", error);
    res.status(500).json({
      success: false,
      message: "Error resetting escalations",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// HTTP function to recalculate escalation counts from conversation data
export const recalculateEscalations = onRequest(
  { cors: true },
  async (req, res) => {
    try {
      // Count currently active escalations (escalated and counted)
      const activeEscalations = await db
        .collection("conversations")
        .where("escalated", "==", true)
        .where("escalationCounted", "==", true)
        .get();

      const escalationCount = activeEscalations.size;

      // Update the support data with the recalculated count
      const doc = await db.collection("support").doc("current").get();

      if (doc.exists) {
        const currentData = doc.data() as SupportData;
        const updatedData: SupportData = {
          ...currentData,
          sessions: {
            ...currentData.sessions,
            escalated: escalationCount,
          },
          lastUpdated: new Date().toISOString(),
          source: "recalculated",
        };

        await db.collection("support").doc("current").set(updatedData);

        res.json({
          success: true,
          message: "Escalation count recalculated successfully",
          previousCount: currentData.sessions.escalated,
          newCount: escalationCount,
          activeEscalations: activeEscalations.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })),
        });
      } else {
        res.status(404).json({
          success: false,
          message: "No support data found to update",
        });
      }
    } catch (error) {
      logger.error("Error recalculating escalations:", error);
      res.status(500).json({
        success: false,
        message: "Error recalculating escalations",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// HTTP function to debug specific conversation escalation - v1.1
export const debugConversationEscalation = onRequest(
  { cors: true },
  async (req, res) => {
    try {
      const conversationId = req.query.conversationId as string;
      if (!conversationId) {
        res.status(400).json({
          success: false,
          message: "conversationId query parameter required",
        });
        return;
      }

      // Get conversation data
      const conversationRef = db
        .collection("conversations")
        .doc(conversationId);
      const conversationDoc = await conversationRef.get();

      // Get webhook events for this conversation
      const webhookEvents = await db
        .collection("webhook-events")
        .where("objectId", "==", conversationId)
        .where("propertyName", "==", "assignedTo")
        .orderBy("timestamp", "asc")
        .get();

      const events = webhookEvents.docs.map((doc) => doc.data());

      // Check for bot assignments
      const botAssignments = events.filter((event) =>
        CONFIG.BOT_AGENT_IDS.includes(event.propertyValue || "")
      );

      // Check for human assignments
      const humanAssignments = events.filter(
        (event) =>
          event.propertyValue &&
          !CONFIG.BOT_AGENT_IDS.includes(event.propertyValue)
      );

      res.json({
        success: true,
        conversationId,
        conversationExists: conversationDoc.exists,
        conversationData: conversationDoc.exists
          ? conversationDoc.data()
          : null,
        webhookEvents: events,
        botAssignments,
        humanAssignments,
        shouldBeEscalation:
          botAssignments.length > 0 && humanAssignments.length > 0,
        config: {
          botAgentIds: CONFIG.BOT_AGENT_IDS,
        },
      });
    } catch (error) {
      logger.error("Error debugging conversation escalation:", error);
      res.status(500).json({
        success: false,
        message: "Error debugging conversation escalation",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// HTTP function to manually process escalation for a specific conversation
export const manualEscalationProcess = onRequest(
  { cors: true },
  async (req, res) => {
    try {
      const conversationId = req.query.conversationId as string;
      if (!conversationId) {
        res.status(400).json({
          success: false,
          message: "conversationId query parameter required",
        });
        return;
      }

      logger.info("🔧 MANUAL ESCALATION PROCESSING STARTED", {
        conversationId,
        timestamp: new Date().toISOString(),
      });

      // Get webhook events for this conversation
      const webhookEvents = await db
        .collection("webhook-events")
        .where("objectId", "==", conversationId)
        .where("propertyName", "==", "assignedTo")
        .orderBy("timestamp", "asc")
        .get();

      const events = webhookEvents.docs.map((doc) => doc.data());

      logger.info("📋 Retrieved webhook events", {
        conversationId,
        eventCount: events.length,
        events: events.map((e) => ({
          timestamp: e.timestamp,
          propertyValue: e.propertyValue,
          isBot: CONFIG.BOT_AGENT_IDS.includes(e.propertyValue || ""),
        })),
      });

      // Process each assignment event in order
      for (const event of events) {
        logger.info("🔄 Processing assignment event", {
          conversationId,
          assignee: event.propertyValue,
          timestamp: event.timestamp,
        });

        // Simulate the webhook event processing
        const webhookEvent: WebhookEvent = {
          subscriptionType: "conversation.propertyChange",
          propertyName: "assignedTo",
          propertyValue: event.propertyValue,
          objectId: conversationId,
          changeFlag: "PROPERTY_CHANGE",
        };

        await checkForBotEscalation(webhookEvent);
      }

      // Check final state
      const conversationDoc = await db
        .collection("conversations")
        .doc(conversationId)
        .get();

      const finalData = await db.collection("support").doc("current").get();

      res.json({
        success: true,
        message: "Manual escalation processing completed",
        conversationId,
        eventsProcessed: events.length,
        finalConversationData: conversationDoc.exists
          ? conversationDoc.data()
          : null,
        finalEscalationCount: finalData.exists
          ? (finalData.data() as SupportData).sessions.escalated
          : null,
      });
    } catch (error) {
      logger.error("❌ Manual escalation processing failed:", error);
      res.status(500).json({
        success: false,
        message: "Error in manual escalation processing",
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

      // Store the raw payload in Firestore for debugging
      await storeWebhookPayload(req);

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
 * Store raw webhook payload for debugging (keep last 100)
 * @param {any} req - Express request object
 * @return {Promise<void>} Promise that resolves when payload is stored
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any, require-jsdoc
async function storeWebhookPayload(req: any): Promise<void> {
  try {
    const payload = {
      method: req.method,
      headers: req.headers,
      body: req.body,
      query: req.query,
      timestamp: new Date().toISOString(),
      userAgent: req.headers["user-agent"] || "",
      sourceIp: req.ip || "",
    };

    // Store the payload
    await db.collection("webhook-payloads").add(payload);

    // Clean up old payloads - keep only the last 100
    // Run cleanup occasionally to avoid performance impact
    if (Math.random() < 0.1) {
      // 10% chance to run cleanup
      await cleanupOldWebhookPayloads();
    }
  } catch (error) {
    logger.error("Error storing webhook payload:", error);
  }
}

/**
 * Clean up old webhook payloads, keeping only the last 100
 * @return {Promise<void>} Promise that resolves when cleanup is complete
 */
async function cleanupOldWebhookPayloads(): Promise<void> {
  try {
    // Get all payloads ordered by timestamp descending
    const allPayloads = await db
      .collection("webhook-payloads")
      .orderBy("timestamp", "desc")
      .get();

    // If we have more than 100, delete the older ones
    if (allPayloads.size > 100) {
      // Keep first 100, delete the rest
      const payloadsToDelete = allPayloads.docs.slice(100);

      // Delete in batches of 500 (Firestore limit)
      const batchSize = 500;
      for (let i = 0; i < payloadsToDelete.length; i += batchSize) {
        const batch = db.batch();
        const batchPayloads = payloadsToDelete.slice(i, i + batchSize);

        batchPayloads.forEach((doc) => {
          batch.delete(doc.ref);
        });

        await batch.commit();
      }

      logger.info("Cleaned up old webhook payloads", {
        totalPayloads: allPayloads.size,
        deleted: payloadsToDelete.length,
        remaining: 100,
      });
    }
  } catch (error) {
    logger.error("Error cleaning up webhook payloads:", error);
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

      // If conversation is being closed, check if we need to decrement
      if (propertyValue === "CLOSED") {
        await handleConversationClosure(objectId);
      }
    }

    // Track assignment changes (AI to human escalation)
    if (propertyName === "assignedTo") {
      logger.info("Conversation assignment changed", {
        conversationId: objectId,
        assignedTo: propertyValue,
      });

      // Check if this is an escalation away from a known bot
      await checkForBotEscalation(event);
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
 * Check if a conversation assignment represents an escalation from bot to human
 * @param {WebhookEvent} event - Webhook event containing assignment change
 * @return {Promise<void>} Promise that resolves when check is complete
 */
async function checkForBotEscalation(event: WebhookEvent): Promise<void> {
  const { objectId, propertyValue } = event;

  try {
    logger.info("=== ESCALATION CHECK START ===", {
      conversationId: objectId,
      assignedTo: propertyValue,
      timestamp: new Date().toISOString(),
    });

    // If no BOT_AGENT_IDS are configured, log a warning and skip detection
    if (CONFIG.BOT_AGENT_IDS.length === 0) {
      logger.warn("No bot agent IDs configured for escalation detection");
      return;
    }

    logger.info("Checking assignment change for escalation", {
      conversationId: objectId,
      newAssignee: propertyValue,
      isBot: CONFIG.BOT_AGENT_IDS.includes(propertyValue || ""),
      configuredBots: CONFIG.BOT_AGENT_IDS,
    });

    const conversationRef = db.collection("conversations").doc(objectId);

    // Handle bot assignment - just track it
    if (propertyValue && CONFIG.BOT_AGENT_IDS.includes(propertyValue)) {
      logger.info("🤖 BOT ASSIGNMENT DETECTED", {
        conversationId: objectId,
        botId: propertyValue,
      });

      try {
        await conversationRef.set(
          {
            currentAssignee: propertyValue,
            lastUpdated: new Date().toISOString(),
            hasBotAssignment: true, // Track that this conversation had a bot
          },
          { merge: true }
        );
        logger.info("✅ Bot assignment stored successfully", {
          conversationId: objectId,
          botId: propertyValue,
        });
      } catch (firestoreError) {
        logger.error("❌ Failed to store bot assignment", {
          conversationId: objectId,
          botId: propertyValue,
          error: firestoreError,
        });
        throw firestoreError;
      }
      return;
    }

    // Handle human assignment - check if it's an escalation
    if (propertyValue && !CONFIG.BOT_AGENT_IDS.includes(propertyValue)) {
      logger.info("👤 HUMAN ASSIGNMENT DETECTED", {
        conversationId: objectId,
        humanAgent: propertyValue,
      });

      // Get current conversation state
      let conversationDoc;
      try {
        conversationDoc = await conversationRef.get();
        logger.info("📄 Conversation document retrieved", {
          conversationId: objectId,
          exists: conversationDoc.exists,
          data: conversationDoc.exists ? conversationDoc.data() : null,
        });
      } catch (firestoreError) {
        logger.error("❌ Failed to retrieve conversation document", {
          conversationId: objectId,
          error: firestoreError,
        });
        throw firestoreError;
      }

      let isEscalation = false;
      let escalatedFrom = "";

      if (conversationDoc.exists) {
        const conversationData = conversationDoc.data();
        const previousAssignee = conversationData?.currentAssignee;
        const hasBotAssignment = conversationData?.hasBotAssignment || false;

        logger.info("🔍 Analyzing existing conversation", {
          conversationId: objectId,
          previousAssignee,
          hasBotAssignment,
          allData: conversationData,
        });

        // Escalation detected if:
        // 1. Previous assignee was a bot, OR
        // 2. Conversation previously had a bot assignment (race condition)
        if (
          (previousAssignee &&
            CONFIG.BOT_AGENT_IDS.includes(previousAssignee)) ||
          hasBotAssignment
        ) {
          isEscalation = true;
          escalatedFrom = previousAssignee || "unknown-bot";
          logger.info("✅ ESCALATION FROM EXISTING DATA", {
            conversationId: objectId,
            previousAssignee,
            hasBotAssignment,
            escalatedFrom,
          });
        } else {
          logger.info("❌ No escalation from existing data", {
            conversationId: objectId,
            previousAssignee,
            hasBotAssignment,
            reason: "No bot assignment found in conversation data",
          });
        }
      } else {
        logger.info("📝 New conversation - checking webhook history", {
          conversationId: objectId,
        });

        // New conversation - check recent webhook events for bot assignment
        // This handles race condition where human assignment comes first
        try {
          const recentBotAssignment = await checkRecentBotAssignment(objectId);
          if (recentBotAssignment) {
            isEscalation = true;
            escalatedFrom = recentBotAssignment;
            logger.info("✅ ESCALATION FROM WEBHOOK HISTORY", {
              conversationId: objectId,
              botFoundInHistory: recentBotAssignment,
            });
          } else {
            logger.info("❌ No bot assignment found in webhook history", {
              conversationId: objectId,
            });
          }
        } catch (webhookError) {
          logger.error("❌ Failed to check webhook history", {
            conversationId: objectId,
            error: webhookError,
          });
          throw webhookError;
        }
      }

      if (isEscalation) {
        logger.info("🚨 ESCALATION CONFIRMED - PROCESSING", {
          conversationId: objectId,
          fromBot: escalatedFrom,
          toHuman: propertyValue,
        });

        try {
          await incrementEscalatedSessions();
          logger.info("✅ Escalation count incremented successfully");
        } catch (incrementError) {
          logger.error("❌ Failed to increment escalation count", {
            error: incrementError,
          });
          throw incrementError;
        }

        // Mark this conversation as escalated to avoid double-counting
        try {
          await conversationRef.set(
            {
              currentAssignee: propertyValue,
              lastUpdated: new Date().toISOString(),
              escalated: true,
              escalatedAt: new Date().toISOString(),
              escalatedFrom: escalatedFrom,
              escalatedTo: propertyValue,
              escalationCounted: true, // Currently counting toward escalations
              hasBotAssignment: true,
            },
            { merge: true }
          );
          logger.info("✅ Escalation data stored successfully", {
            conversationId: objectId,
            escalatedFrom,
            escalatedTo: propertyValue,
          });
        } catch (escalationStoreError) {
          logger.error("❌ Failed to store escalation data", {
            conversationId: objectId,
            error: escalationStoreError,
          });
          throw escalationStoreError;
        }
      } else {
        logger.info("📝 No escalation - storing human assignment", {
          conversationId: objectId,
          humanAgent: propertyValue,
        });

        // Just update the current assignee
        try {
          await conversationRef.set(
            {
              currentAssignee: propertyValue,
              lastUpdated: new Date().toISOString(),
            },
            { merge: true }
          );
          logger.info("✅ Human assignment stored successfully", {
            conversationId: objectId,
            assignee: propertyValue,
          });
        } catch (assignmentStoreError) {
          logger.error("❌ Failed to store human assignment", {
            conversationId: objectId,
            error: assignmentStoreError,
          });
          throw assignmentStoreError;
        }
      }
    }

    logger.info("=== ESCALATION CHECK COMPLETE ===", {
      conversationId: objectId,
      success: true,
    });
  } catch (error) {
    logger.error("❌ ESCALATION CHECK FAILED", {
      conversationId: objectId,
      assignedTo: propertyValue,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Don't throw the error to prevent webhook processing from failing
    // Just log it for debugging
  }
}

/**
 * Check recent webhook events for bot assignment to handle race conditions
 * @param {string} conversationId - Conversation ID to check
 * @return {Promise<string|null>} Bot ID if found, null otherwise
 */
async function checkRecentBotAssignment(
  conversationId: string
): Promise<string | null> {
  try {
    logger.info("🔍 Checking webhook history for bot assignment", {
      conversationId,
    });

    // Look for recent bot assignment events for this conversation
    const recentEvents = await db
      .collection("webhook-events")
      .where("objectId", "==", conversationId)
      .where("propertyName", "==", "assignedTo")
      .orderBy("timestamp", "desc")
      .limit(10)
      .get();

    logger.info("📊 Webhook events found", {
      conversationId,
      eventCount: recentEvents.docs.length,
    });

    for (const doc of recentEvents.docs) {
      const event = doc.data();
      logger.info("🔎 Examining webhook event", {
        conversationId,
        eventPropertyValue: event.propertyValue,
        eventTimestamp: event.timestamp,
        isBot: CONFIG.BOT_AGENT_IDS.includes(event.propertyValue || ""),
      });

      if (
        event.propertyValue &&
        CONFIG.BOT_AGENT_IDS.includes(event.propertyValue)
      ) {
        logger.info("✅ Found recent bot assignment in webhook events", {
          conversationId,
          botId: event.propertyValue,
          timestamp: event.timestamp,
        });
        return event.propertyValue;
      }
    }

    logger.info("❌ No bot assignment found in webhook history", {
      conversationId,
      eventsChecked: recentEvents.docs.length,
    });

    return null;
  } catch (error) {
    logger.error("❌ Error checking recent bot assignment", {
      conversationId,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return null;
  }
}

/**
 * Handle conversation closure and update escalation counts
 * @param {string} conversationId - ID of the conversation being closed
 * @return {Promise<void>} Promise that resolves when closure is handled
 */
async function handleConversationClosure(
  conversationId: string
): Promise<void> {
  try {
    const conversationRef = db.collection("conversations").doc(conversationId);
    const conversationDoc = await conversationRef.get();

    if (conversationDoc.exists) {
      const conversationData = conversationDoc.data();

      // Check if this conversation was previously escalated
      if (conversationData?.escalated === true) {
        logger.info("Closed conversation was escalated, decrementing count", {
          conversationId,
          escalatedFrom: conversationData.escalatedFrom,
          escalatedTo: conversationData.escalatedTo,
        });

        await decrementEscalatedSessions();

        // Mark conversation as closed and no longer counting
        await conversationRef.update({
          status: "CLOSED",
          closedAt: new Date().toISOString(),
          escalationCounted: false, // No longer counting toward escalations
        });
      } else {
        // Just mark as closed even if it wasn't escalated
        await conversationRef.update({
          status: "CLOSED",
          closedAt: new Date().toISOString(),
        });
      }
    }
  } catch (error) {
    logger.error("Error handling conversation closure:", error);
  }
}

/**
 * Decrement escalated sessions counter
 * @return {Promise<void>} Promise that resolves when counter is updated
 */
async function decrementEscalatedSessions(): Promise<void> {
  try {
    // Get current data
    const doc = await db.collection("support").doc("current").get();

    if (doc.exists) {
      const currentData = doc.data() as SupportData;

      // Decrement escalated sessions (don't go below 0)
      const newCount = Math.max(0, currentData.sessions.escalated - 1);

      const updatedData: SupportData = {
        ...currentData,
        sessions: {
          ...currentData.sessions,
          escalated: newCount,
        },
        lastUpdated: new Date().toISOString(),
        source: "webhook-closure",
      };

      await db.collection("support").doc("current").set(updatedData);
      logger.info("Escalated sessions decremented", {
        previousCount: currentData.sessions.escalated,
        newCount: updatedData.sessions.escalated,
        conversationClosed: true,
      });
    }
  } catch (error) {
    logger.error("Error decrementing escalated sessions:", error);
  }
}

/**
 * Increment escalated sessions counter
 * @return {Promise<void>} Promise that resolves when counter is updated
 */
async function incrementEscalatedSessions(): Promise<void> {
  try {
    logger.info("📈 Incrementing escalated sessions count");

    // Get current data
    const doc = await db.collection("support").doc("current").get();

    if (doc.exists) {
      const currentData = doc.data() as SupportData;
      const previousCount = currentData.sessions.escalated;

      logger.info("📊 Current escalation count", {
        previousCount,
      });

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

      logger.info("✅ Escalated sessions incremented successfully", {
        previousCount: currentData.sessions.escalated,
        newCount: updatedData.sessions.escalated,
      });
    } else {
      logger.warn(
        "⚠️ No support data document found for incrementing escalations"
      );
      throw new Error("Support data document not found");
    }
  } catch (error) {
    logger.error("❌ Error incrementing escalated sessions", {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}
