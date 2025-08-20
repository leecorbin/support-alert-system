import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import axios from "axios";

// Define the secrets
const hubspotAccessToken = defineSecret("HUBSPOT_ACCESS_TOKEN");
const botAgentIds = defineSecret("BOT_AGENT_IDS"); // Comma-separated list of bot agent IDs
// Note: Notifications will use console logging and Firestore only for now

// Initialize Firebase Admin
initializeApp();
const db = getFirestore();

// Support data interface
interface SupportData {
  tickets: {
    open: number;
    chat: number;
    email: number;
    other: number;
  };
  sessions: {
    active: number | null; // null when data unavailable
    escalated: number | null; // null when data unavailable
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
  id: string;
  status: string;
  originalChannelId?: string;
  hs_originating_generic_channel_id?: string;
  hs_originating_channel_instance_id?: string;
  createdAt: string;
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
 * Get bot agent IDs from configuration
 * @return {string[]} Array of bot agent IDs
 */
function getBotAgentIds(): string[] {
  try {
    const botIdsValue = botAgentIds.value();
    return botIdsValue ? botIdsValue.split(",").map((id) => id.trim()) : [];
  } catch (error) {
    logger.warn("Failed to get bot agent IDs from config, using empty array", {
      error,
    });
    return [];
  }
}

// ===== REAL-TIME NOTIFICATION SYSTEM =====

/**
 * Send immediate alert for critical support events
 * @param {string} type - Type of alert: 'new_chat', 'escalation', 'closure'
 * @param {object} data - Event data
 * @return {Promise<void>} Promise that resolves when alert is sent
 */
async function sendImmediateAlert(type: string, data: object): Promise<void> {
  const timestamp = new Date().toISOString();
  const alertMessage = formatAlertMessage(type, data, timestamp);

  logger.info("🚨 SENDING IMMEDIATE ALERT", {
    type,
    message: alertMessage,
    data,
    timestamp,
  });

  // Send to console and Firestore for immediate visibility
  const alertPromises = [
    logCriticalAlert(type, alertMessage, data), // Always log to Firestore
    sendConsoleAlert(alertMessage, type), // Always log prominently to console
  ];

  // Note: Slack and email notifications removed for simplified deployment
  // Can be re-added later with proper configuration management

  // Don't block the webhook response - send alerts in background
  Promise.allSettled(alertPromises).then((results) => {
    const successful = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    logger.info("Alert delivery status", {
      type,
      successful,
      failed,
      total: results.length,
    });
  });
}

/**
 * Format alert message based on event type
 * @param {string} type - Alert type
 * @param {object} data - Event data
 * @param {string} timestamp - Alert timestamp
 * @return {string} Formatted alert message
 */
function formatAlertMessage(
  type: string,
  data: object,
  timestamp: string
): string {
  const eventData = data as Record<string, unknown>;
  switch (type) {
    case "new_chat":
      return (
        `🆕 NEW CHAT STARTED\n` +
        `Conversation ID: ${eventData.conversationId}\n` +
        `Time: ${timestamp}\n` +
        `Action Required: Monitor for escalation`
      );

    case "escalation":
      return (
        `🚨 ESCALATION TO HUMAN\n` +
        `Conversation ID: ${eventData.conversationId}\n` +
        `Assigned to: ${eventData.assignedTo}\n` +
        `Previous: Bot (${eventData.previousAssignee})\n` +
        `Time: ${timestamp}\n` +
        `Action Required: IMMEDIATE RESPONSE NEEDED`
      );

    case "closure":
      return (
        `✅ CONVERSATION CLOSED\n` +
        `Conversation ID: ${eventData.conversationId}\n` +
        `Final Status: ${eventData.status}\n` +
        `Time: ${timestamp}`
      );

    default:
      return (
        `📢 SUPPORT ALERT\n` +
        `Type: ${type}\n` +
        `Data: ${JSON.stringify(data)}\n` +
        `Time: ${timestamp}`
      );
  }
}

/**
 * Send a console alert with prominent visibility
 * @param {string} message - Alert message
 * @param {string} type - Alert type
 * @return {Promise<void>} Promise that resolves when console alert is logged
 */
async function sendConsoleAlert(message: string, type: string): Promise<void> {
  const alertBorder = "=".repeat(80);
  const timestamp = new Date().toISOString();

  console.log("\n" + alertBorder);
  console.log(`🚨 SUPPORT ALERT [${type.toUpperCase()}] - ${timestamp}`);
  console.log(alertBorder);
  console.log(message);
  console.log(alertBorder + "\n");

  // Also use structured logging for Cloud Functions
  logger.warn(`SUPPORT_ALERT_${type.toUpperCase()}`, { message, timestamp });
}

/**
 * Log critical alert to Firestore for audit trail
 * @param {string} type - Alert type
 * @param {string} message - Alert message
 * @param {object} data - Event data
 * @return {Promise<void>} Promise that resolves when alert is logged
 */
async function logCriticalAlert(
  type: string,
  message: string,
  data: object
): Promise<void> {
  try {
    await db.collection("critical-alerts").add({
      type,
      message,
      data,
      timestamp: new Date().toISOString(),
      processed: true,
    });

    logger.info("✅ Critical alert logged to Firestore", { type });
  } catch (error) {
    logger.error("❌ Failed to log critical alert", { error, type });
    throw error;
  }
}

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
    // Debug: Log the filter we're about to use
    logger.info("DEBUG: About to search tickets with filter:", {
      configuredStages: CONFIG.OPEN_TICKET_STAGES,
      filterValue: CONFIG.OPEN_TICKET_STAGES,
    });

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

    // Debug: Log all ticket stages to understand what we're getting
    logger.info("DEBUG: All tickets and their stages:", {
      totalTickets: tickets.length,
      ticketStages: tickets.map((t: HubSpotTicket) => ({
        stage: t.properties.hs_pipeline_stage,
        sourceType: t.properties.source_type,
      })),
      currentFilter: CONFIG.OPEN_TICKET_STAGES,
    });

    const openTickets = tickets.length;
    const chatTickets = tickets.filter(
      (t: HubSpotTicket) => t.properties.source_type === "CHAT"
    ).length;
    const emailTickets = tickets.filter(
      (t: HubSpotTicket) => t.properties.source_type === "EMAIL"
    ).length;
    const otherTickets = openTickets - chatTickets - emailTickets;

    return {
      tickets: {
        open: openTickets,
        chat: chatTickets,
        email: emailTickets,
        other: otherTickets,
      },
      sessions: {
        // Use chat tickets count as active sessions since conversations API is unreliable
        active: chatTickets, // chatTickets is already a number (.length)
        escalated: await getEscalatedSessions(), // Only counts truly active escalations
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
 * Currently disabled - using chat tickets count instead
 * @param {string} token - HubSpot access token
 * @return {Promise<number|null>} Number of active chat sessions or null if unavailable
 */
/* async function getActiveChatSessionsFromHubSpot(
  token: string
): Promise<number | null> {
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
          // Note: HubSpot API may not support createdAt filtering directly
          // We'll filter the results after fetching
        },
      }
    );

    // Filter for active chat threads
    const threads = response.data.results || [];
    logger.info(
      "HubSpot Conversations API response sample:",
      JSON.stringify(threads.slice(0, 3), null, 2)
    );

    // Filter for recent conversations (last 7 days) and active chats
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    logger.info("DEBUG: About to filter conversations", {
      totalThreads: threads.length,
      sevenDaysThreshold: sevenDaysAgo.toISOString(),
    });

    const recentAndActiveChats = threads.filter((thread: HubSpotThread) => {
      const createdAt = new Date(thread.createdAt);
      const isRecent = createdAt > sevenDaysAgo;
      const isOpen = thread.status === "OPEN";
      // Temporarily remove channel filter to see all open conversations
      // const isLiveChat = thread.originalChannelId === "1000";

      // Log ALL conversations for debugging
      logger.info(`DEBUG: Conversation ${thread.id}:`, {
        createdAt: thread.createdAt,
        status: thread.status,
        originalChannelId: thread.originalChannelId,
        hs_originating_generic_channel_id:
          thread.hs_originating_generic_channel_id,
        hs_originating_channel_instance_id:
          thread.hs_originating_channel_instance_id,
        isRecent,
        isOpen,
        willInclude: isRecent && isOpen, // Remove channel filter temporarily
      });

      return isRecent && isOpen; // Simplified filter - just recent and open
    });

    logger.info("Filtered active chat sessions:", recentAndActiveChats.length);
    return recentAndActiveChats.length;
  } catch (error) {
    logger.error("Error fetching active chat sessions from HubSpot:", error);
    return null; // Return null to indicate unavailable data
  }
} */

/**
 * Get sessions escalated to human agents (only currently active ones)
 */
async function getEscalatedSessions(): Promise<number | null> {
  try {
    // Query for active escalated conversations
    // Only count conversations that are:
    // 1. escalated: true
    // 2. escalationCounted: true
    // 3. status is explicitly "OPEN" (not "CLOSED" and not undefined)
    try {
      const activeEscalations = await db
        .collection("conversations")
        .where("escalated", "==", true)
        .where("escalationCounted", "==", true)
        .get();

      // Filter for conversations that are explicitly OPEN and recent
      const openEscalations = activeEscalations.docs.filter((doc) => {
        const data = doc.data();

        // Must have explicit OPEN status (not undefined or CLOSED)
        if (data.status !== "OPEN") {
          return false;
        }

        // Exclude very old conversations (more than 24 hours old)
        // This ensures we only count truly recent escalations
        if (data.lastUpdated) {
          const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const lastUpdated = data.lastUpdated.toDate
            ? data.lastUpdated.toDate()
            : new Date(data.lastUpdated);
          if (lastUpdated < twentyFourHoursAgo) {
            return false;
          }
        }

        return true; // Keep if status is OPEN and recent
      });

      const escalationCount = openEscalations.length;

      logger.info("Current active escalated sessions", {
        count: escalationCount,
        totalEscalatedInDB: activeEscalations.size,
        openEscalations: openEscalations.length,
        conversationIds: openEscalations.map((doc) => doc.id),
        method: "status-filtered-query",
        statusBreakdown: activeEscalations.docs.reduce((acc, doc) => {
          const status = doc.data().status || "undefined";
          acc[status] = (acc[status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      });

      return escalationCount;
    } catch (queryError) {
      logger.warn("Escalation query failed, returning null", {
        error: queryError instanceof Error ? queryError.message : queryError,
      });
      return null; // Indicate data unavailable
    }
  } catch (error) {
    logger.error("Error getting escalated sessions count:", error);
    return null; // Return null to indicate unavailable data
  }
}

/**
 * Generate mock data
 * @param {string} source - Source identifier for the mock data
 * @return {SupportData} Mock support data
 */
function getMockData(source: string): SupportData {
  // Return realistic "no data available" state instead of random numbers
  return {
    tickets: {
      open: 0,
      chat: 0,
      email: 0,
      other: 0,
    },
    sessions: {
      active: null, // Indicate unavailable data
      escalated: null, // Indicate unavailable data
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
  {
    cors: true,
    secrets: [botAgentIds], // Add access to bot agent IDs secret
  },
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
      const configuredBotIds = getBotAgentIds();
      const config = {
        botAgentIds: configuredBotIds,
        botAgentIdsConfigured: configuredBotIds.length > 0,
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

// HTTP function to debug specific escalated conversations
export const debugSpecificConversations = onRequest(
  { cors: true },
  async (req, res) => {
    try {
      const conversationIds = [
        "13384608972",
        "13386663153",
        "test-conversation-1753889127",
        "test-conversation-1753889500",
      ];
      const results = [];

      for (const convId of conversationIds) {
        try {
          const doc = await db.collection("conversations").doc(convId).get();
          if (doc.exists) {
            const data = doc.data();
            const lastUpdated = data?.lastUpdated;
            const createdAt = data?.createdAt;

            results.push({
              id: convId,
              status: data?.status || "undefined",
              escalated: data?.escalated,
              escalationCounted: data?.escalationCounted,
              lastUpdated: lastUpdated?.toDate
                ? lastUpdated.toDate().toISOString()
                : lastUpdated || "N/A",
              createdAt: createdAt?.toDate
                ? createdAt.toDate().toISOString()
                : createdAt || "N/A",
              exists: true,
            });
          } else {
            results.push({
              id: convId,
              exists: false,
            });
          }
        } catch (error) {
          results.push({
            id: convId,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      res.json({
        success: true,
        conversations: results,
        message: "Debug info for specific conversations retrieved successfully",
      });
    } catch (error) {
      logger.error("Error debugging specific conversations:", error);
      res.status(500).json({
        success: false,
        message: "Error debugging specific conversations",
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
  {
    cors: true,
    secrets: [botAgentIds], // Add access to bot agent IDs secret
  },
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
      // Handle both string and number objectId formats
      const numericConversationId = parseInt(conversationId, 10);
      const webhookEvents = await db
        .collection("webhook-events")
        .where("objectId", "==", numericConversationId)
        .where("propertyName", "==", "assignedTo")
        .orderBy("timestamp", "asc")
        .get();

      const events = webhookEvents.docs.map((doc) => doc.data());

      // Get bot agent IDs
      const configuredBotIds = getBotAgentIds();

      // Check for bot assignments
      const botAssignments = events.filter((event) =>
        configuredBotIds.includes(event.propertyValue || "")
      );

      // Check for human assignments
      const humanAssignments = events.filter(
        (event) =>
          event.propertyValue && !configuredBotIds.includes(event.propertyValue)
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
          botAgentIds: configuredBotIds,
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
      const numericConversationId = parseInt(conversationId, 10);
      const webhookEvents = await db
        .collection("webhook-events")
        .where("objectId", "==", numericConversationId)
        .where("propertyName", "==", "assignedTo")
        .orderBy("timestamp", "asc")
        .get();

      const events = webhookEvents.docs.map((doc) => doc.data());

      // Get bot agent IDs
      const configuredBotIds = getBotAgentIds();

      logger.info("📋 Retrieved webhook events", {
        conversationId,
        eventCount: events.length,
        events: events.map((e) => ({
          timestamp: e.timestamp,
          propertyValue: e.propertyValue,
          isBot: configuredBotIds.includes(e.propertyValue || ""),
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
    secrets: [hubspotAccessToken, botAgentIds], // Include bot agent IDs configuration
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

    // 🚨 REAL-TIME ALERT: New conversation created
    if (subscriptionType === "conversation.creation") {
      logger.info("🆕 NEW CONVERSATION DETECTED - SENDING IMMEDIATE ALERT");
      await sendImmediateAlert("new_chat", {
        conversationId: objectId,
        subscriptionType,
      });
    }

    // Track conversation status changes for active sessions
    if (propertyName === "status") {
      logger.info("Conversation status changed", {
        conversationId: objectId,
        newStatus: propertyValue,
      });

      // 🚨 REAL-TIME ALERT: Conversation closed
      if (propertyValue === "CLOSED") {
        logger.info("✅ CONVERSATION CLOSED - SENDING IMMEDIATE ALERT");
        await sendImmediateAlert("closure", {
          conversationId: objectId,
          status: propertyValue,
        });
        await handleConversationClosure(String(objectId));
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

  // Convert objectId to string for Firestore document ID
  const conversationId = String(objectId);

  try {
    logger.info("=== ESCALATION CHECK START ===", {
      conversationId,
      assignedTo: propertyValue,
      timestamp: new Date().toISOString(),
    });

    // Get bot agent IDs from configuration
    const configuredBotIds = getBotAgentIds();

    // If no bot agent IDs are configured, log a warning and skip detection
    if (configuredBotIds.length === 0) {
      logger.warn("No bot agent IDs configured for escalation detection");
      return;
    }

    logger.info("Checking assignment change for escalation", {
      conversationId,
      newAssignee: propertyValue,
      isBot: configuredBotIds.includes(propertyValue || ""),
      configuredBots: configuredBotIds,
    });

    const conversationRef = db.collection("conversations").doc(conversationId);

    // Handle bot assignment - just track it
    if (propertyValue && configuredBotIds.includes(propertyValue)) {
      logger.info("🤖 BOT ASSIGNMENT DETECTED", {
        conversationId,
        botId: propertyValue,
      });

      try {
        await conversationRef.set(
          {
            currentAssignee: propertyValue,
            lastUpdated: new Date().toISOString(),
            hasBotAssignment: true, // Track that this conversation had a bot
            status: "OPEN", // Mark as open when bot is assigned
          },
          { merge: true }
        );
        logger.info("✅ Bot assignment stored successfully", {
          conversationId,
          botId: propertyValue,
        });
      } catch (firestoreError) {
        logger.error("❌ Failed to store bot assignment", {
          conversationId,
          botId: propertyValue,
          error: firestoreError,
        });
        throw firestoreError;
      }
      return;
    }

    // Handle human assignment - check if it's an escalation
    if (propertyValue && !configuredBotIds.includes(propertyValue)) {
      logger.info("👤 HUMAN ASSIGNMENT DETECTED", {
        conversationId,
        humanAgent: propertyValue,
      });

      // Get current conversation state
      let conversationDoc;
      try {
        conversationDoc = await conversationRef.get();
        logger.info("📄 Conversation document retrieved", {
          conversationId,
          exists: conversationDoc.exists,
          data: conversationDoc.exists ? conversationDoc.data() : null,
        });
      } catch (firestoreError) {
        logger.error("❌ Failed to retrieve conversation document", {
          conversationId,
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
          conversationId,
          previousAssignee,
          hasBotAssignment,
          allData: conversationData,
        });

        // Escalation detected if:
        // 1. Previous assignee was a bot, OR
        // 2. Conversation previously had a bot assignment (race condition)
        if (
          (previousAssignee && configuredBotIds.includes(previousAssignee)) ||
          hasBotAssignment
        ) {
          isEscalation = true;
          escalatedFrom = previousAssignee || "unknown-bot";
          logger.info("✅ ESCALATION FROM EXISTING DATA", {
            conversationId,
            previousAssignee,
            hasBotAssignment,
            escalatedFrom,
          });
        } else {
          logger.info("❌ No escalation from existing data", {
            conversationId,
            previousAssignee,
            hasBotAssignment,
            reason: "No bot assignment found in conversation data",
          });
        }
      } else {
        logger.info("📝 New conversation - checking webhook history", {
          conversationId,
        });

        // New conversation - check recent webhook events for bot assignment
        // This handles race condition where human assignment comes first
        try {
          const recentBotAssignment = await checkRecentBotAssignment(
            conversationId
          );
          if (recentBotAssignment) {
            isEscalation = true;
            escalatedFrom = recentBotAssignment;
            logger.info("✅ ESCALATION FROM WEBHOOK HISTORY", {
              conversationId,
              botFoundInHistory: recentBotAssignment,
            });
          } else {
            logger.info("❌ No bot assignment found in webhook history", {
              conversationId,
            });
          }
        } catch (webhookError) {
          logger.error("❌ Failed to check webhook history", {
            conversationId,
            error: webhookError,
          });
          throw webhookError;
        }
      }

      if (isEscalation) {
        logger.info("🚨 ESCALATION CONFIRMED - PROCESSING", {
          conversationId,
          fromBot: escalatedFrom,
          toHuman: propertyValue,
        });

        // 🚨 REAL-TIME ALERT: Critical escalation to human
        logger.info(
          "🚨 SENDING CRITICAL ESCALATION ALERT - IMMEDIATE RESPONSE NEEDED"
        );
        await sendImmediateAlert("escalation", {
          conversationId,
          assignedTo: propertyValue,
          previousAssignee: escalatedFrom,
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
              status: "OPEN", // Explicitly mark as open for accurate counting
            },
            { merge: true }
          );
          logger.info("✅ Escalation data stored successfully", {
            conversationId,
            escalatedFrom,
            escalatedTo: propertyValue,
          });
        } catch (escalationStoreError) {
          logger.error("❌ Failed to store escalation data", {
            conversationId,
            error: escalationStoreError,
          });
          throw escalationStoreError;
        }
      } else {
        logger.info("📝 No escalation - storing human assignment", {
          conversationId,
          humanAgent: propertyValue,
        });

        // Just update the current assignee
        try {
          await conversationRef.set(
            {
              currentAssignee: propertyValue,
              lastUpdated: new Date().toISOString(),
              status: "OPEN", // Mark as open for human assignment too
            },
            { merge: true }
          );
          logger.info("✅ Human assignment stored successfully", {
            conversationId,
            assignee: propertyValue,
          });
        } catch (assignmentStoreError) {
          logger.error("❌ Failed to store human assignment", {
            conversationId,
            error: assignmentStoreError,
          });
          throw assignmentStoreError;
        }
      }
    }

    logger.info("=== ESCALATION CHECK COMPLETE ===", {
      conversationId,
      success: true,
    });
  } catch (error) {
    logger.error("❌ ESCALATION CHECK FAILED", {
      conversationId,
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
    // Handle both string and number objectId formats
    const numericConversationId = parseInt(conversationId, 10);
    const recentEvents = await db
      .collection("webhook-events")
      .where("objectId", "==", numericConversationId)
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

      // Get bot agent IDs
      const configuredBotIds = getBotAgentIds();

      logger.info("🔎 Examining webhook event", {
        conversationId,
        eventPropertyValue: event.propertyValue,
        eventTimestamp: event.timestamp,
        isBot: configuredBotIds.includes(event.propertyValue || ""),
      });

      if (
        event.propertyValue &&
        configuredBotIds.includes(event.propertyValue)
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
      const currentCount = currentData.sessions.escalated || 0;
      const newCount = Math.max(0, currentCount - 1);

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
      const currentCount = currentData.sessions.escalated || 0;
      const updatedData: SupportData = {
        ...currentData,
        sessions: {
          ...currentData.sessions,
          escalated: currentCount + 1,
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

// HTTP function to clear all conversation data and start fresh
export const clearAllConversationData = onRequest(
  { cors: true },
  async (req, res) => {
    try {
      // Get all conversations
      const conversationsSnapshot = await db.collection("conversations").get();

      if (conversationsSnapshot.empty) {
        res.json({
          success: true,
          message: "No conversations found to delete",
          deletedCount: 0,
        });
        return;
      }

      // Delete all conversations in batches
      const batch = db.batch();
      const conversationIds: string[] = [];

      conversationsSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
        conversationIds.push(doc.id);
      });

      await batch.commit();

      // Also clear webhook events older than 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const oldWebhookEvents = await db
        .collection("webhook-events")
        .where("timestamp", "<", oneDayAgo.toISOString())
        .get();

      if (!oldWebhookEvents.empty) {
        const webhookBatch = db.batch();
        oldWebhookEvents.docs.forEach((doc) => {
          webhookBatch.delete(doc.ref);
        });
        await webhookBatch.commit();
      }

      // Reset support data counters to zero
      await db
        .collection("support-data")
        .doc("current")
        .set({
          tickets: {
            open: 0,
            chat: 0,
            email: 0,
            other: 0,
          },
          sessions: {
            active: 0,
            escalated: 0,
          },
          lastUpdated: new Date().toISOString(),
          source: "data-reset",
        });

      logger.info("🧹 All conversation data cleared successfully", {
        deletedConversations: conversationsSnapshot.size,
        deletedWebhookEvents: oldWebhookEvents.size,
        conversationIds: conversationIds,
      });

      res.json({
        success: true,
        message: "All conversation data cleared successfully",
        deletedConversations: conversationsSnapshot.size,
        deletedWebhookEvents: oldWebhookEvents.size,
        conversationIds: conversationIds,
      });
    } catch (error) {
      logger.error("❌ Error clearing conversation data:", error);
      res.status(500).json({
        success: false,
        message: "Error clearing conversation data",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Debug endpoint to show conversation details
export const debugConversationDetails = onRequest(
  { cors: true, secrets: [hubspotAccessToken] },
  async (req, res) => {
    try {
      const token = hubspotAccessToken.value();

      // Fetch conversations from HubSpot
      const response = await axios.get(
        "https://api.hubapi.com/conversations/v3/conversations/threads",
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          params: {
            limit: 10,
          },
        }
      );

      const threads = response.data.results || [];
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

      type ConversationAnalysis = {
        id: string;
        createdAt: string;
        status: string;
        originalChannelId: string;
        filters: {
          isRecent: boolean;
          isOpen: boolean;
          isLiveChat: boolean;
          wouldCount: boolean;
        };
      };

      const conversationAnalysis: ConversationAnalysis[] = threads.map(
        (thread: HubSpotThread) => {
          const createdAt = new Date(thread.createdAt);
          const isRecent = createdAt > yesterday;
          const isOpen = thread.status === "OPEN";
          const isLiveChat = thread.originalChannelId === "1000";

          return {
            id: thread.id,
            createdAt: thread.createdAt,
            status: thread.status,
            originalChannelId: thread.originalChannelId,
            filters: {
              isRecent,
              isOpen,
              isLiveChat,
              wouldCount: isRecent && isOpen && isLiveChat,
            },
          };
        }
      );

      const activeConversations = conversationAnalysis.filter(
        (conversation: ConversationAnalysis) => conversation.filters.wouldCount
      );

      res.json({
        success: true,
        totalConversations: threads.length,
        yesterdayThreshold: yesterday.toISOString(),
        conversations: conversationAnalysis,
        activeCount: activeConversations.length,
      });
    } catch (error) {
      logger.error("Error debugging conversation details:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching conversation details",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);
