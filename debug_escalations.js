const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp({
  projectId: 'support-alert-system-68982',
});

const db = admin.firestore();

async function debugEscalations() {
  const conversationIds = ["13384608972", "13386663153", "test-conversation-1753889127", "test-conversation-1753889500"];
  
  for (const convId of conversationIds) {
    try {
      const doc = await db.collection('conversations').doc(convId).get();
      if (doc.exists) {
        const data = doc.data();
        console.log(`\nConversation ${convId}:`);
        console.log(`  Status: ${data.status || 'undefined'}`);
        console.log(`  Escalated: ${data.escalated}`);
        console.log(`  EscalationCounted: ${data.escalationCounted}`);
        console.log(`  Last Updated: ${data.lastUpdated?.toDate() || 'N/A'}`);
        console.log(`  Created: ${data.createdAt?.toDate() || 'N/A'}`);
      } else {
        console.log(`\nConversation ${convId}: Document does not exist`);
      }
    } catch (error) {
      console.error(`Error checking ${convId}:`, error);
    }
  }
  
  process.exit(0);
}

debugEscalations().catch(console.error);
