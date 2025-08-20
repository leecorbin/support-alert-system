import React, { useState, useEffect, useRef } from "react";
import {
  Headphones,
  MessageCircle,
  Mail,
  Users,
  User,
  Volume2,
  VolumeX,
} from "lucide-react";
import axios from "axios";
import { API_ENDPOINTS } from "./config/api";
import soundManager from "./utils/soundManager";

const App = () => {
  const [supportData, setSupportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(soundManager.enabled);
  const previousDataRef = useRef(null);

  console.log("🚀 App component rendered - supportData:", supportData);

  const fetchSupportData = async () => {
    console.log("🔄 Fetching support data...");
    try {
      setError(null);
      // Use new Firestore-based endpoint
      const response = await axios.get(API_ENDPOINTS.SUPPORT);
      console.log("📡 API Response:", response.data);

      if (response.data.success) {
        const newData = response.data.data;
        console.log("📊 New data received:", newData);
        console.log("📊 Previous data (from ref):", previousDataRef.current);

        // Check for changes and play sounds using ref for previous data
        if (previousDataRef.current) {
          console.log("🔄 About to check for sound triggers...");
          checkForSoundTriggers(previousDataRef.current, newData);
        } else {
          console.log("⚠️  No previous data to compare - skipping sound check");
        }

        // Update both state and ref
        setSupportData(newData);
        previousDataRef.current = newData;
        console.log("💾 State and ref updated with new data");
        setIsOnline(true);
        setLastChecked(new Date());
      } else {
        throw new Error(response.data.message || "Failed to fetch data");
      }
    } catch (err) {
      console.error("Error fetching support data:", err);
      setError(
        "Failed to fetch support data. Please check if the Firebase Functions are deployed."
      );
      setIsOnline(false);
    } finally {
      setLoading(false);
    }
  };

  // Check for changes that should trigger sounds
  const checkForSoundTriggers = (oldData, newData) => {
    if (!oldData || !newData) {
      console.log("🔇 Sound check skipped: missing data", {
        oldData: !!oldData,
        newData: !!newData,
      });
      return;
    }

    console.log("🔊 Checking for sound triggers:", {
      oldEscalated: oldData.sessions?.escalated,
      newEscalated: newData.sessions?.escalated,
      oldTotal: (oldData.tickets?.open || 0) + (oldData.sessions?.active || 0),
      newTotal: (newData.tickets?.open || 0) + (newData.sessions?.active || 0),
      soundEnabled,
      soundManagerEnabled: soundManager.enabled,
    });

    // Check for new escalations (most important)
    if (newData.sessions?.escalated > oldData.sessions?.escalated) {
      console.log("🚨 Escalation detected - playing urgent sound");
      soundManager.playSound("escalation");
      return; // Don't play other sounds if there's an escalation
    }

    // Check for new tickets/conversations
    const oldTotal =
      (oldData.tickets?.open || 0) + (oldData.sessions?.active || 0);
    const newTotal =
      (newData.tickets?.open || 0) + (newData.sessions?.active || 0);

    if (newTotal > oldTotal) {
      console.log(
        "🔔 New ticket/conversation detected - attempting to play sound",
        { oldTotal, newTotal }
      );
      soundManager.playSound("newTicket");
    } else if (newTotal < oldTotal) {
      console.log("✅ Ticket/conversation closed - attempting to play sound", {
        oldTotal,
        newTotal,
      });
      soundManager.playSound("ticketClosed");
    } else {
      console.log("➖ No changes detected", { oldTotal, newTotal });
    }
  };

  // Toggle sound on/off
  const toggleSound = () => {
    const newSoundState = !soundEnabled;
    setSoundEnabled(newSoundState);
    soundManager.setEnabled(newSoundState);

    if (newSoundState) {
      // Play a test sound when enabling
      soundManager.playSound("newTicket");
    }
  };

  useEffect(() => {
    fetchSupportData();

    // Poll for updates every 10 seconds for good balance of responsiveness and efficiency
    const interval = setInterval(fetchSupportData, 10000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatLastUpdated = (timestamp) => {
    if (!timestamp) return "Never";
    const date = new Date(timestamp);
    const now = new Date();

    // Check if it's today
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      // Show only time if it's today
      return date.toLocaleTimeString();
    } else {
      // Show full date and time if it's not today
      return date.toLocaleString();
    }
  };

  const getTotalTickets = () => {
    if (!supportData?.tickets) return 0;
    // The 'open' field already contains the total count of open tickets
    // 'chat' and 'email' are breakdowns of the open tickets by source type
    return supportData.tickets.open;
  };

  // Update body class based on support state
  React.useEffect(() => {
    const getBackgroundState = () => {
      if (!supportData) return "loading";

      const escalations = supportData.sessions?.escalated || 0;
      const openTickets = supportData?.tickets?.open || 0;

      if (escalations > 0) return "escalated";
      if (openTickets > 0) return "active";
      return "clear";
    };

    const state = getBackgroundState();
    document.body.className = `bg-${state}`;

    return () => {
      document.body.className = "";
    };
  }, [supportData]);

  if (loading) {
    return (
      <div className="app">
        <div className="loading">
          <div className="loading-spinner"></div>
          <div>Loading support dashboard...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Support Alert Dashboard</h1>
      </header>

      <div className="dashboard">
        <div className="status-bar">
          <div className="status-indicator">
            <div
              className={`status-dot ${isOnline ? "online" : "offline"}`}
            ></div>
            <span>{isOnline ? "Connected" : "Disconnected"}</span>
          </div>

          <div className="header-controls">
            <button
              className={`sound-toggle ${
                soundEnabled ? "enabled" : "disabled"
              }`}
              onClick={toggleSound}
              title={
                soundEnabled ? "Disable sound alerts" : "Enable sound alerts"
              }
            >
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              <span>{soundEnabled ? "On" : "Off"}</span>
            </button>
            {process.env.NODE_ENV === "development" && (
              <button
                className="sound-toggle enabled"
                onClick={() => soundManager.testSounds()}
                title="Test all sound alerts"
              >
                <Headphones size={16} />
                <span>Test</span>
              </button>
            )}
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        {supportData && (
          <>
            <div className="metrics-grid">
              <div className="metric-card">
                <h3>
                  <Headphones size={24} />
                  Open Tickets
                </h3>
                <div className="metric-item">
                  <span className="metric-label">
                    <MessageCircle
                      size={16}
                      style={{ display: "inline", marginRight: "5px" }}
                    />
                    Chat Tickets
                  </span>
                  <span className="metric-value">
                    {supportData.tickets.chat}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">
                    <Mail
                      size={16}
                      style={{ display: "inline", marginRight: "5px" }}
                    />
                    Email Tickets
                  </span>
                  <span className="metric-value">
                    {supportData.tickets.email}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Other Tickets</span>
                  <span className="metric-value">
                    {supportData.tickets.other}
                  </span>
                </div>
                <div
                  className="metric-item"
                  style={{
                    background: "rgba(255, 255, 255, 0.2)",
                    fontWeight: "bold",
                  }}
                >
                  <span className="metric-label">Total Tickets</span>
                  <span className="metric-value">{getTotalTickets()}</span>
                </div>
              </div>

              <div className="metric-card">
                <h3>
                  <Users size={24} />
                  Chat Sessions
                </h3>
                <div className="metric-item">
                  <span className="metric-label">Active Sessions</span>
                  <span className="metric-value">
                    {supportData.sessions.active !== null
                      ? supportData.sessions.active
                      : "⚠️"}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">
                    <User
                      size={16}
                      style={{ display: "inline", marginRight: "5px" }}
                    />
                    Escalated to Human
                  </span>
                  <span className="metric-value">
                    {supportData.sessions.escalated !== null
                      ? supportData.sessions.escalated
                      : "⚠️"}
                  </span>
                </div>
              </div>
            </div>

            <div className="last-updated">
              📊 <strong>{formatLastUpdated(supportData.lastUpdated)}</strong> •
              🔄 {formatLastUpdated(lastChecked)}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default App;
