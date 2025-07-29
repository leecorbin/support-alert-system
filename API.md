# API Documentation

## Base URL

```
http://localhost:5001
```

## Endpoints

### Health Check

**GET** `/health`

Returns server health status.

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2025-07-29T10:30:00.000Z",
  "uptime": 1234.567
}
```

### Update Support Data (HubSpot Webhook)

**POST** `/api/support`

Endpoint for HubSpot to send updated support data.

**Request Headers:**

```
Content-Type: application/json
```

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

**Success Response (200):**

```json
{
  "message": "Support data updated successfully",
  "data": {
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
}
```

**Error Responses:**

**400 Bad Request:**

```json
{
  "error": "Missing required fields: tickets and sessions"
}
```

**500 Internal Server Error:**

```json
{
  "error": "Internal server error"
}
```

### Get Latest Support Data

**GET** `/api/support`

Returns the latest support data for the dashboard.

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

## Data Validation

### Tickets Object

- `open` (number, required): Number of open tickets
- `chat` (number, required): Number of chat tickets
- `email` (number, required): Number of email tickets

### Sessions Object

- `live` (number, required): Number of live support sessions
- `human` (number, required): Number of human agents available

## Testing

Use the provided test script to simulate HubSpot sending data:

```bash
npm run test-hubspot
```

This will send several test data batches to the server every 3 seconds.

## CORS

CORS is enabled for all origins in development mode. In production, you should configure specific allowed origins.

## Rate Limiting

Currently no rate limiting is implemented. Consider adding rate limiting in production environments.
