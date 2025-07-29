import React, { useState, useEffect } from "react";
import { Headphones, MessageCircle, Mail, Users, User } from "lucide-react";
import axios from "axios";

const App = () => {
  const [supportData, setSupportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOnline, setIsOnline] = useState(false);

  const fetchSupportData = async () => {
    try {
      setError(null);
      const response = await axios.get("/api/support");
      setSupportData(response.data);
      setIsOnline(true);
    } catch (err) {
      console.error("Error fetching support data:", err);
      setError(
        "Failed to fetch support data. Please check if the server is running."
      );
      setIsOnline(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSupportData();

    // Poll for updates every 30 seconds
    const interval = setInterval(fetchSupportData, 30000);

    return () => clearInterval(interval);
  }, []);

  const formatLastUpdated = (timestamp) => {
    if (!timestamp) return "Never";
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getTotalTickets = () => {
    if (!supportData?.tickets) return 0;
    return (
      supportData.tickets.open +
      supportData.tickets.chat +
      supportData.tickets.email
    );
  };

  const getTotalSessions = () => {
    if (!supportData?.sessions) return 0;
    return supportData.sessions.live + supportData.sessions.human;
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
                  Support Tickets
                </h3>
                <div className="metric-item">
                  <span className="metric-label">Open Tickets</span>
                  <span className="metric-value">
                    {supportData.tickets.open}
                  </span>
                </div>
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
                  Support Sessions
                </h3>
                <div className="metric-item">
                  <span className="metric-label">Live Sessions</span>
                  <span className="metric-value">
                    {supportData.sessions.live}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">
                    <User
                      size={16}
                      style={{ display: "inline", marginRight: "5px" }}
                    />
                    Human Agents
                  </span>
                  <span className="metric-value">
                    {supportData.sessions.human}
                  </span>
                </div>
                <div
                  className="metric-item"
                  style={{
                    background: "rgba(255, 255, 255, 0.2)",
                    fontWeight: "bold",
                  }}
                >
                  <span className="metric-label">Total Sessions</span>
                  <span className="metric-value">{getTotalSessions()}</span>
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
