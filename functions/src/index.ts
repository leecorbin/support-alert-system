import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as cors from "cors";

// Export scheduled functions
export {
  collectSupportData,
  triggerSupportDataCollection,
  getCurrentSupportData,
} from "./scheduler";

// Enable CORS for all requests
const corsHandler = cors.default({ origin: true });

// In-memory storage for support data
let supportData = {
  tickets: {
    open: 0,
    chat: 0,
    email: 0,
  },
  sessions: {
    live: 0,
    human: 0,
  },
  lastUpdated: new Date().toISOString(),
};

// Health check function
export const health = onRequest((request, response) => {
  corsHandler(request, response, () => {
    response.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      function: "support-alert-system",
    });
  });
});

// Support data API function
export const support = onRequest((request, response) => {
  corsHandler(request, response, () => {
    try {
      if (request.method === "GET") {
        // Return current support data
        response.json(supportData);
        return;
      }

      if (request.method === "POST") {
        // Update support data from HubSpot
        const { tickets, sessions } = request.body;

        // Validate required fields
        if (!tickets || !sessions) {
          response.status(400).json({
            error: "Missing required fields: tickets and sessions",
          });
          return;
        }

        // Validate tickets structure
        if (
          typeof tickets.open !== "number" ||
          typeof tickets.chat !== "number" ||
          typeof tickets.email !== "number"
        ) {
          response.status(400).json({
            error: "Invalid tickets data structure",
          });
          return;
        }

        // Validate sessions structure
        if (
          typeof sessions.live !== "number" ||
          typeof sessions.human !== "number"
        ) {
          response.status(400).json({
            error: "Invalid sessions data structure",
          });
          return;
        }

        // Update support data
        supportData = {
          tickets: {
            open: tickets.open,
            chat: tickets.chat,
            email: tickets.email,
          },
          sessions: {
            live: sessions.live,
            human: sessions.human,
          },
          lastUpdated: new Date().toISOString(),
        };

        logger.info("Support data updated:", supportData);

        response.json({
          message: "Support data updated successfully",
          data: supportData,
        });
        return;
      }

      // Method not allowed
      response.status(405).json({
        error: "Method not allowed",
      });
    } catch (error) {
      logger.error("Error in support function:", error);
      response.status(500).json({
        error: "Internal server error",
      });
    }
  });
});
