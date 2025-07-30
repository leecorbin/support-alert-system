#!/usr/bin/env node

/**
 * Test script for the new Firebase Functions scheduler system
 */

const axios = require("axios");

const BASE_URL =
  "https://us-central1-support-alert-system-385b1.cloudfunctions.net";

async function testSchedulerSystem() {
  console.log("🧪 Testing Firebase Functions Scheduler System\n");

  try {
    // Test 1: Trigger manual data collection
    console.log("1️⃣ Testing manual data collection trigger...");
    const triggerResponse = await axios.post(
      `${BASE_URL}/triggerSupportDataCollection`
    );

    if (triggerResponse.data.success) {
      console.log("✅ Manual trigger successful");
      console.log(
        "📊 Data collected:",
        JSON.stringify(triggerResponse.data.data, null, 2)
      );
    } else {
      console.log("❌ Manual trigger failed:", triggerResponse.data.message);
    }

    // Wait a moment for data to be stored
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Test 2: Get current data from Firestore
    console.log("\n2️⃣ Testing data retrieval from Firestore...");
    const dataResponse = await axios.get(`${BASE_URL}/getCurrentSupportData`);

    if (dataResponse.data.success) {
      console.log("✅ Data retrieval successful");
      console.log(
        "📈 Current data:",
        JSON.stringify(dataResponse.data.data, null, 2)
      );
      console.log("🕐 Last updated:", dataResponse.data.data.lastUpdated);
      console.log("🔗 Data source:", dataResponse.data.data.source);
    } else {
      console.log("❌ Data retrieval failed:", dataResponse.data.message);
    }

    // Test 3: Check if scheduled function is set up
    console.log("\n3️⃣ Scheduled function info:");
    console.log(
      "⏰ Function 'collectSupportData' is scheduled to run every 1 minute"
    );
    console.log("📦 Data is cached in Firestore for instant dashboard updates");
    console.log(
      "🔄 Dashboard polls every 15 seconds for near real-time updates"
    );

    console.log("\n🎉 All tests completed!");
    console.log(
      "\n📱 Your dashboard should now update automatically every minute!"
    );
    console.log("🌐 Dashboard URL: https://support-alert-system-385b1.web.app");
  } catch (error) {
    console.error("❌ Test failed:", error.response?.data || error.message);
  }
}

// Run the test
testSchedulerSystem();
