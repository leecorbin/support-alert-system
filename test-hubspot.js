#!/usr/bin/env node

const axios = require("axios");

const SERVER_URL = "http://localhost:5001";

// Sample support data that simulates what HubSpot might send
const sampleData = [
  {
    tickets: { open: 5, chat: 3, email: 2 },
    sessions: { live: 4, human: 2 },
  },
  {
    tickets: { open: 8, chat: 5, email: 3 },
    sessions: { live: 6, human: 3 },
  },
  {
    tickets: { open: 3, chat: 2, email: 1 },
    sessions: { live: 2, human: 1 },
  },
  {
    tickets: { open: 12, chat: 8, email: 4 },
    sessions: { live: 10, human: 5 },
  },
];

async function sendTestData() {
  console.log("🧪 Starting HubSpot simulation...\n");

  for (let i = 0; i < sampleData.length; i++) {
    const data = sampleData[i];

    try {
      console.log(
        `📊 Sending data batch ${i + 1}:`,
        JSON.stringify(data, null, 2)
      );

      const response = await axios.post(`${SERVER_URL}/api/support`, data);

      console.log(`✅ Response:`, response.data.message);
      console.log(
        `📈 Updated data:`,
        JSON.stringify(response.data.data, null, 2)
      );
    } catch (error) {
      console.error(
        `❌ Error sending data batch ${i + 1}:`,
        error.response?.data || error.message
      );
    }

    console.log(""); // Empty line for readability

    // Wait 3 seconds between requests
    if (i < sampleData.length - 1) {
      console.log("⏳ Waiting 3 seconds before next update...\n");
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  console.log("🎉 Simulation complete!");
  console.log("💡 You can now check the dashboard at http://localhost:3001");
}

// Check if server is running first
async function checkServer() {
  try {
    await axios.get(`${SERVER_URL}/health`);
    console.log("✅ Server is running\n");
    return true;
  } catch (error) {
    console.error(
      "❌ Server is not running. Please start the server first with: npm run server"
    );
    console.error("   Or start both server and client with: npm run dev\n");
    return false;
  }
}

async function main() {
  console.log("🚀 HubSpot Data Simulator\n");

  const serverRunning = await checkServer();
  if (serverRunning) {
    await sendTestData();
  }
}

main().catch(console.error);
