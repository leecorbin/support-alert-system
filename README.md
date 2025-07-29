# Support Alert System

A real-time support dashboard that receives data from HubSpot and displays it in an attractive React interface.

## Features

- **Node.js Server**: RESTful API with two endpoints
  - `/api/support` (POST) - Receives support data from HubSpot
  - `/api/support` (GET) - Returns latest support data
- **React Dashboard**: Real-time support metrics visualization
- **In-Memory Storage**: Fast data access with optional persistence

## Project Structure

```
support-alert-system/
├── server/          # Node.js Express server
├── client/          # React dashboard
└── README.md
```

## Quick Start

1. Install all dependencies:

   ```bash
   npm run install-all
   ```

2. Start both server and client in development mode:

   ```bash
   npm run dev
   ```

3. Access the dashboard at `http://localhost:3001`
4. Server API available at `http://localhost:5001`

## API Endpoints

### POST `/api/support`

Accepts support data from HubSpot.

**Request Body:**

```json
{
  "tickets": {
    "open": 4,
    "chat": 3,
    "email": 1
  },
  "sessions": {
    "live": 2,
    "human": 1
  }
}
```

### GET `/api/support`

Returns the latest support data.

**Response:**

```json
{
  "tickets": {
    "open": 4,
    "chat": 3,
    "email": 1
  },
  "sessions": {
    "live": 2,
    "human": 1
  },
  "lastUpdated": "2025-07-29T10:30:00.000Z"
}
```

## Development

- Server runs on port 5001
- Client runs on port 3001
- CORS enabled for development
- Auto-reload on file changes
