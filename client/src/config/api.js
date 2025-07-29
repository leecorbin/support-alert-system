// Firebase Functions configuration
const FIREBASE_PROJECT_ID = "support-alert-system-385b1";
const FIREBASE_REGION = "us-central1";

// API endpoints configuration
export const API_CONFIG = {
  // Development mode - use local Firebase emulator or deployed functions
  isDevelopment: process.env.NODE_ENV === "development",

  // Firebase Functions URLs
  FUNCTIONS_BASE_URL: `https://${FIREBASE_REGION}-${FIREBASE_PROJECT_ID}.cloudfunctions.net`,

  // Local emulator URL (for development)
  EMULATOR_BASE_URL:
    "http://localhost:5001/support-alert-system-385b1/us-central1",
};

// Get the appropriate base URL
const getBaseUrl = () => {
  // Always use Firebase Functions for now (change when functions are deployed)
  return API_CONFIG.FUNCTIONS_BASE_URL;

  // Uncomment below for emulator testing:
  // if (API_CONFIG.isDevelopment) {
  //   return API_CONFIG.EMULATOR_BASE_URL;
  // }
  // return API_CONFIG.FUNCTIONS_BASE_URL;
};

export const API_ENDPOINTS = {
  SUPPORT: `${getBaseUrl()}/support`,
  HEALTH: `${getBaseUrl()}/health`,
};
