# DockForLife OBS Proxy (Phase 3)

This is the local OBS Proxy component for the DockForLife project. It enables remote OBS control by exposing a WebSocket API compatible with the Phase 2 contract.

## Quick Start

### Prerequisites

- Go 1.21 or later
- OBS Studio with obs-websocket plugin (port 4455)

### Building

```bash
cd proxy
go build -o dockforlife-proxy ./cmd/proxy
```

### Running

```bash
./dockforlife-proxy --obs-url ws://127.0.0.1:4455 --port 4456
```

### Configuration

The proxy can be configured via command-line flags or environment variables:

| Flag | Environment Variable | Default | Description |
|------|---------------------|---------|-------------|
| `--listen` | `DFL_PROXY_LISTEN` | `0.0.0.0` | Listen address |
| `--port` | `DFL_PROXY_PORT` | `4456` | Listen port |
| `--obs-url` | `DFL_PROXY_OBS_URL` | `ws://127.0.0.1:4455` | OBS WebSocket URL |
| `--obs-password` | `DFL_PROXY_OBS_PASSWORD` | (none) | OBS WebSocket password |
| `--worker-url` | `DFL_PROXY_WORKER_URL` | (none) | Cloudflare Worker URL |
| `--auth-token` | `DFL_PROXY_AUTH_TOKEN` | (none) | Client authentication |
| `--log-level` | `DFL_PROXY_LOG_LEVEL` | `info` | Log level (debug, info, warn, error) |

### Connecting Frontend

Once the proxy is running, the frontend can connect to:

```
ws://localhost:4456/ws
```

## Systemd Service

Example systemd service file (`dockforlife-proxy.service`):

```ini
[Unit]
Description=DockForLife OBS Proxy
After=network.target

[Service]
Type=simple
User=obs
ExecStart=/usr/local/bin/dockforlife-proxy --obs-url ws://127.0.0.1:4455 --port 4456
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Install and enable:

```bash
sudo cp dockforlife-proxy.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable dockforlife-proxy
sudo systemctl start dockforlife-proxy
```

## Architecture

```
+----------+     +--------------+     +-----------+     +----------+
| Browser  | --> | Proxy (ws)   | --> | OBS Proxy | --> | OBS      |
+----------+     +--------------+     +-----------+     +----------+
                       |
                       v
              +----------------+
              | Cloudflare     |  (future Phase 4)
              | Worker         |
              +----------------+
```

## Contract

The proxy implements the Phase 2 contract (version 1.0.0). Commands are JSON-serialized over WebSocket.

### Example Commands

**Mute:**
```json
{
  "type": "mute",
  "target": "Microphone",
  "timestamp": 1704067200000
}
```

**Scene Switch:**
```json
{
  "type": "scene",
  "target": "Main Scene",
  "timestamp": 1704067200000
}
```

**Filter Toggle:**
```json
{
  "type": "filter",
  "target": "Camera",
  "filter": "Color Correction",
  "timestamp": 1704067200000
}
```

### Response Format

```json
{
  "type": "result",
  "payload": {
    "success": true,
    "command": { ... },
    "timestamp": 1704067200000
  }
}
```

## Security

- The proxy should run on the same machine as OBS
- For local network use, bind to `127.0.0.1` or use firewall rules
- For remote access, configure authentication via `--auth-token`
- Never expose OBS WebSocket directly to the internet

## Phase Progression

This proxy is Phase 3 of the DockForLife architecture:

1. **Phase 1**: Observability (completed)
2. **Phase 2**: Contract normalization (completed)
3. **Phase 3**: Local OBS Proxy (this component)
4. **Phase 4**: Cloudflare Worker (future)
5. **Phase 5**: Remote UX optimization (future)
6. **Phase 6**: Production hardening (future)
