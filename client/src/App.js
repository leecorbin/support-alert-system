import React, { useState, useEffect } from "react";
import { Headphones, MessageCircle, Mail, Users, User } from "lucide-react";
import axios from "axios";
import { API_ENDPOINTS } from "./config/api";

const App = () => {
  const [supportData, setSupportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOnline, setIsOnline] = useState(false);

  const fetchSupportData = async () => {
    try {
      setError(null);
      // Use new Firestore-based endpoint
      const response = await axios.get(API_ENDPOINTS.SUPPORT);

      if (response.data.success) {
        setSupportData(response.data.data);
        setIsOnline(true);
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

  useEffect(() => {
    fetchSupportData();

    // Poll for updates every 15 seconds (since data is cached in Firestore)
    const interval = setInterval(fetchSupportData, 15000);

    return () => clearInterval(interval);
  }, []);

  const formatLastUpdated = (timestamp) => {
    if (!timestamp) return "Never";
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getTotalTickets = () => {
    if (!supportData?.tickets) return 0;
    // The 'open' field already contains the total count of open tickets
    // 'chat' and 'email' are breakdowns of the open tickets by source type
    return supportData.tickets.open;
  };

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
        <p>Real-time support metrics and alerts</p>
      </header>

      <div className="dashboard">
        <div className="status-indicator">
          <div
            className={`status-dot ${isOnline ? "online" : "offline"}`}
          ></div>
          <span>{isOnline ? "Connected" : "Disconnected"}</span>
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
                {supportData.tickets.other > 0 && (
                  <div className="metric-item">
                    <span className="metric-label">Other Tickets</span>
                    <span className="metric-value">
                      {supportData.tickets.other}
                    </span>
                  </div>
                )}
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
                    {supportData.sessions.active}
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
                    {supportData.sessions.escalated}
                  </span>
                </div>
              </div>
            </div>

            <div className="last-updated">
              Last updated: {formatLastUpdated(supportData.lastUpdated)}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default App;
