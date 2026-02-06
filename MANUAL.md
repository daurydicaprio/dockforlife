# DockForLife Manual

Professional OBS remote control with Zero Configuration.

## Requirements

- OBS Studio with obs-websocket plugin (v5.x)
- Node.js 18+ and pnpm (for development)
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

## Standalone Agent (Recommended for Users)

Download the pre-built executable for your platform from GitHub Releases:

- **Windows:** `dockforlife-agent-win.exe`
- **Linux:** `dockforlife-agent-linux`
- **macOS:** `dockforlife-agent-mac`

Windows users: Simply download and run the `.exe` file. No Node.js installation required.

### Running the Agent

```bash
# Linux/macOS
chmod +x dockforlife-agent-linux
./dockforlife-agent-linux

# Windows
./dockforlife-agent-win.exe
```

The agent will start and connect to your local OBS automatically.

## Building the Agent from Source

To build the agent executable from source:

```bash
cd agent
npm ci
npm run build
npx pkg . --targets node18-win-x64,node18-linux-x64,node18-macos-x64 --out-path ./dist
```

Binaries will be in `agent/dist/`.

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
