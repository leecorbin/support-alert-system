import { onRequest } from "firebase-functions/v2/https";
import * as cors from "cors";

// Export all functions from scheduler
export {
  collectSupportData,
  triggerSupportDataCollection,
  getCurrentSupportData,
  hubspotWebhook,
  getWebhookActivity,
  getEscalationDebugInfo,
  getWebhookPayloads,
  recalculateEscalations,
  resetEscalations,
  debugConversationEscalation,
  manualEscalationProcess,
} from "./scheduler";

// Enable CORS for all requests
const corsHandler = cors.default({ origin: true });

// Health check function
export const health = onRequest((request, response) => {
  corsHandler(request, response, () => {
    response.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      function: "support-alert-system",
      version: "2.1-with-escalation-tracking",
    });
  });
});
