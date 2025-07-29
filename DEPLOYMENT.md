# Docker Deployment Guide

This guide shows how to deploy your Support Alert System using Docker on your VPS.

## Prerequisites

- Docker and Docker Compose installed on your VPS
- Git installed on your VPS
- Your VPS accessible via SSH

## Deployment Steps

### 1. Clone the Repository on Your VPS

```bash
git clone <your-repository-url> support-alert-system
cd support-alert-system
```

### 2. Build and Start with Docker Compose

```bash
# Build and start the application
docker-compose up -d --build

# Check if it's running
docker-compose ps

# View logs
docker-compose logs -f
```

### 3. Access Your Application

- **Dashboard**: `http://your-vps-ip:5001`
- **API**: `http://your-vps-ip:5001/api/support`
- **Health Check**: `http://your-vps-ip:5001/health`

### 4. Configure HubSpot Webhook

Set your HubSpot webhook URL to:

```
http://your-vps-ip:5001/api/support
```

## Docker Commands

### Development

```bash
# Build the image
docker build -t support-alert-system .

# Run locally
docker run -p 5001:5001 support-alert-system

# Run with environment variables
docker run -p 5001:5001 -e NODE_ENV=production support-alert-system
```

### Production Management

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# Restart services
docker-compose restart

# Update application
git pull
docker-compose up -d --build

# View logs
docker-compose logs -f support-alert-system

# Check health
curl http://localhost:5001/health
```

## Environment Variables

You can create a `.env` file in the root directory:

```env
NODE_ENV=production
PORT=5001
```

## SSL/HTTPS Setup (Recommended)

For production, set up SSL using nginx or Caddy as a reverse proxy:

### With Caddy (Recommended)

Create a `Caddyfile`:

```
your-domain.com {
    reverse_proxy localhost:5001
}
```

### With nginx

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Monitoring

The container includes a health check. Monitor with:

```bash
# Check container health
docker-compose ps

# Monitor logs
docker-compose logs -f

# Check application health
curl http://localhost:5001/health
```

## Backup (Optional)

Since the app uses in-memory storage, consider adding persistent storage if needed:

```yaml
# Add to docker-compose.yml
volumes:
  - ./data:/app/data
```

## Troubleshooting

1. **Port already in use**: Change the port in docker-compose.yml
2. **Build fails**: Check Docker and Node.js versions
3. **Can't access externally**: Check firewall settings
4. **API not working**: Check logs with `docker-compose logs`

## Updates

To update the application:

```bash
git pull
docker-compose down
docker-compose up -d --build
```
