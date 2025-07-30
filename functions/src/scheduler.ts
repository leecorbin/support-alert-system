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

// Configuration
const CONFIG = {
  // HubSpot Support Pipeline stage IDs for "open" tickets
  // Support Pipeline (ID: 0) open stages:
  // "1" = New, "2" = Waiting on contact, "3" = Waiting on us
  // Excludes "4" = Closed
  OPEN_TICKET_STAGES: ["1", "2", "3"],
};

/**
 * Get HubSpot pipeline stages (for debugging)
 */
async function getHubSpotPipelines(token: string) {
  try {
    const response = await axios.get(
      "https://api.hubapi.com/crm/v3/pipelines/tickets",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    logger.info("HubSpot Pipeline Information:", response.data);
    return response.data;
  } catch (error) {
    logger.error("Error fetching HubSpot pipelines:", error);
    throw error;
  }
}

/**
 * Get support data from HubSpot
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
      (t: any) => t.properties.source_type === "CHAT"
    ).length;
    const emailTickets = tickets.filter(
      (t: any) => t.properties.source_type === "EMAIL"
    ).length;

    return {
      tickets: {
        open: openTickets,
        chat: chatTickets,
        email: emailTickets,
      },
      sessions: {
        active: await getActiveChatSessionsFromHubSpot(token),
        escalated: await getEscalatedSessions(), // still mock for now
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
    const activeChats = threads.filter((thread: any) => {
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
  // For now, we'll use a realistic simulation
  // TODO: Integrate with HubSpot to track AI-to-human escalations
  const businessHours =
    new Date().getHours() >= 9 && new Date().getHours() <= 17;
  return businessHours
    ? Math.floor(Math.random() * 3) // 0-2 escalated sessions during business hours
    : 0; // No escalations outside business hours
}

/**
 * Generate mock data
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

// Scheduled function that runs every minute
export const collectSupportData = onSchedule(
  {
    schedule: "every 1 minutes",
    secrets: [hubspotAccessToken],
  },
  async (event) => {
    logger.info("Starting scheduled support data collection");

    try {
      let data: SupportData;

      // Use HubSpot if token is available, otherwise use mock data
      const token = hubspotAccessToken.value();
      if (token) {
        data = await getHubSpotData(token);
      } else {
        data = getMockData("scheduled-mock");
        logger.warn("No HubSpot token configured, using mock data");
      }

      // Store in Firestore
      await storeSupportData(data);

      logger.info("Support data collection completed", {
        tickets: data.tickets,
        sessions: data.sessions,
        source: data.source,
      });
    } catch (error) {
      logger.error("Error in scheduled support data collection:", error);
    }
  }
);

// HTTP function to check HubSpot pipeline configuration
export const checkHubSpotPipelines = onRequest(
  {
    cors: true,
    secrets: [hubspotAccessToken],
  },
  async (req, res) => {
    try {
      const token = hubspotAccessToken.value();
      if (!token) {
        res.status(400).json({
          success: false,
          message: "HubSpot token not configured",
        });
        return;
      }

      const pipelines = await getHubSpotPipelines(token);

      res.json({
        success: true,
        message: "HubSpot pipeline information retrieved",
        data: pipelines,
      });
    } catch (error) {
      logger.error("Error checking HubSpot pipelines:", error);
      res.status(500).json({
        success: false,
        message: "Error retrieving pipeline information",
        error: error instanceof Error ? error.message : "Unknown error",
      });
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
