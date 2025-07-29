const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan("combined"));
app.use(express.json());

// Serve static files from React build
app.use(express.static(path.join(__dirname, "public")));

// In-memory storage for support data
let supportData = {
  tickets: {
    open: 0,
    chat: 0,
    email: 0,
  },
  sessions: {
    live: 0,
    human: 0,
  },
  lastUpdated: new Date().toISOString(),
};

// Routes

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// POST endpoint for HubSpot to send support data
app.post("/api/support", (req, res) => {
  try {
    const { tickets, sessions } = req.body;

    // Validate required fields
    if (!tickets || !sessions) {
      return res.status(400).json({
        error: "Missing required fields: tickets and sessions",
      });
    }

    // Validate tickets structure
    if (
      typeof tickets.open !== "number" ||
      typeof tickets.chat !== "number" ||
      typeof tickets.email !== "number"
    ) {
      return res.status(400).json({
        error: "Invalid tickets data structure",
      });
    }

    // Validate sessions structure
    if (
      typeof sessions.live !== "number" ||
      typeof sessions.human !== "number"
    ) {
      return res.status(400).json({
        error: "Invalid sessions data structure",
      });
    }

    // Update support data
    supportData = {
      tickets: {
        open: tickets.open,
        chat: tickets.chat,
        email: tickets.email,
      },
      sessions: {
        live: sessions.live,
        human: sessions.human,
      },
      lastUpdated: new Date().toISOString(),
    };

    console.log("Support data updated:", supportData);

    res.json({
      message: "Support data updated successfully",
      data: supportData,
    });
  } catch (error) {
    console.error("Error updating support data:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
});

// GET endpoint to retrieve latest support data
app.get("/api/support", (req, res) => {
  try {
    res.json(supportData);
  } catch (error) {
    console.error("Error retrieving support data:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
});

// Serve React app for all non-API routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Error handler
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  res.status(500).json({
    error: "Internal server error",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Support Alert Server running on port ${PORT}`);
  console.log(
    `📊 Dashboard API available at http://localhost:${PORT}/api/support`
  );
  console.log(
    `🔗 HubSpot webhook endpoint at http://localhost:${PORT}/api/support`
  );
});
