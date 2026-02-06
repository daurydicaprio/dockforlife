# DockForLife Manual

Professional OBS remote control with Zero Configuration.

## Requirements

- Node.js 18+ and pnpm
- OBS Studio with obs-websocket plugin (v5.x)
- Go 1.21+ (for proxy server)
- Docker and Docker Compose (optional)

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/daurydicaprio/dockforlife.git
cd dockforlife
```

### 2. Install Frontend Dependencies

```bash
pnpm install
```

### 3. Configure Application

Copy the example configuration and adjust settings:

```bash
cp dockforlife.config.json.example dockforlife.config.json
```

Edit `dockforlife.config.json`:

```json
{
  "OBS_PORT": 4455,
  "OBS_PASSWORD": "your-obs-websocket-password",
  "WORKER_URL": "https://your-worker-url.workers.dev"
}
```

**Configuration Options:**
- `OBS_PORT`: OBS WebSocket port (default: 4455)
- `OBS_PASSWORD`: OBS WebSocket password (optional)
- `WORKER_URL`: Cloudflare Worker URL for remote connections

### 4. Start Development Server

```bash
pnpm dev
```

Access the application at `http://localhost:3000`

## OBS Studio Setup

1. Open OBS Studio
2. Go to Tools > WebSocket Server Settings
3. Enable WebSocket Server
4. Set a password if desired
5. Note the port (default: 4455)

## Building the Proxy Server

The proxy server enables remote connections via Cloudflare Workers:

```bash
cd proxy
go build -o dockforlife-proxy .
```

Run the proxy:

```bash
./dockforlife-proxy
```

## Deployment

### Frontend (Vercel)

```bash
vercel deploy
```

### Cloudflare Worker

Deploy the worker from the `worker/` directory:

```bash
cd worker
wrangler deploy
```

## Troubleshooting

**Connection Failed:**
- Verify OBS WebSocket is enabled
- Check port and password in configuration
- Ensure firewall allows the connection

**Remote Mode Issues:**
- Verify WORKER_URL is accessible
- Check Cloudflare Worker logs
- Ensure JOIN_CODE is valid

## License

See [LICENSE](./LICENSE) for usage terms.
