#!/usr/bin/env node

const axios = require('axios');

// Firebase Functions URLs (update these once functions are deployed)
const FUNCTIONS_BASE_URL = 'https://us-central1-support-alert-system-385b1.cloudfunctions.net';
const SUPPORT_URL = `${FUNCTIONS_BASE_URL}/support`;
const HEALTH_URL = `${FUNCTIONS_BASE_URL}/health`;

// Sample support data that simulates what HubSpot might send
const sampleData = [
  {
    tickets: { open: 5, chat: 3, email: 2 },
    sessions: { live: 4, human: 2 }
  },
  {
    tickets: { open: 8, chat: 5, email: 3 },
    sessions: { live: 6, human: 3 }
  },
  {
    tickets: { open: 3, chat: 2, email: 1 },
    sessions: { live: 2, human: 1 }
  },
  {
    tickets: { open: 12, chat: 8, email: 4 },
    sessions: { live: 10, human: 5 }
  }
];

async function sendTestData() {
  console.log('🧪 Starting Firebase Functions HubSpot simulation...\n');
  
  for (let i = 0; i < sampleData.length; i++) {
    const data = sampleData[i];
    
    try {
      console.log(`📊 Sending data batch ${i + 1}:`, JSON.stringify(data, null, 2));
      
      const response = await axios.post(SUPPORT_URL, data);
      
      console.log(`✅ Response:`, response.data.message);
      console.log(`📈 Updated data:`, JSON.stringify(response.data.data, null, 2));
      
    } catch (error) {
      console.error(`❌ Error sending data batch ${i + 1}:`, error.response?.data || error.message);
    }
    
    console.log(''); // Empty line for readability
    
    // Wait 3 seconds between requests
    if (i < sampleData.length - 1) {
      console.log('⏳ Waiting 3 seconds before next update...\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  console.log('🎉 Simulation complete!');
  console.log('💡 You can now check the dashboard at your Firebase Hosting URL');
}

// Check if functions are running first
async function checkFunctions() {
  try {
    await axios.get(HEALTH_URL);
    console.log('✅ Firebase Functions are running\n');
    return true;
  } catch (error) {
    console.error('❌ Firebase Functions are not available. Please deploy them first.');
    console.error('   Run: firebase deploy --only functions');
    console.error('   Note: Requires Blaze (pay-as-you-go) plan\n');
    return false;
  }
}

async function main() {
  console.log('🚀 Firebase Functions HubSpot Data Simulator\n');
  
  const functionsRunning = await checkFunctions();
  if (functionsRunning) {
    await sendTestData();
  }
}

main().catch(console.error);
