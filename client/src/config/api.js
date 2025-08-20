// Firebase Functions configuration
// Note: Update these values for your own Firebase project
const FIREBASE_PROJECT_ID =
  process.env.REACT_APP_FIREBASE_PROJECT_ID || "your-firebase-project-id";
const FIREBASE_REGION = process.env.REACT_APP_FIREBASE_REGION || "us-central1";

// API endpoints configuration
export const API_CONFIG = {
  // Development mode - use local Firebase emulator or deployed functions
  isDevelopment: process.env.NODE_ENV === "development",

  // Firebase Functions URLs - using the correct v2 format
  FUNCTIONS_BASE_URL: `https://getcurrentsupportdata-nts4expcga-uc.a.run.app`,

  // Local emulator URL (for development)
  EMULATOR_BASE_URL: `http://localhost:5001/${FIREBASE_PROJECT_ID}/${FIREBASE_REGION}`,
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
  BASE_URL: getBaseUrl(),
  SUPPORT: API_CONFIG.FUNCTIONS_BASE_URL, // Direct URL to the function
  HEALTH: `${getBaseUrl()}/health`,
  TRIGGER_COLLECTION: `${getBaseUrl()}/triggerSupportDataCollection`,
};
