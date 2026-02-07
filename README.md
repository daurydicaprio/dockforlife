# DockForLife

**Version: 0.001 Beta**

[![License](https://img.shields.io/badge/license-Sustainable%20Use-orange.svg)](LICENSE)

Professional OBS Remote Controller with Zero Configuration.

Control your OBS Studio from any device—mobile, tablet, or desktop—without complicated network setup. DockForLife uses a Cloudflare Worker relay to enable seamless remote control from anywhere.

---

## Architecture: The Triad

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              WEB APPLICATION                                 │
│                         (Next.js + React + Tailwind)                        │
│                  https://dock.daurydicaprio.com or custom                   │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                              WebSocket (WSS)
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLOUDFLARE WORKER (RELAY)                           │
│                      dockforlife-relay.prod.workers.dev                      │
│                         (or your custom worker)                              │
│                                                                             │
│    ┌─────────────────────────────────────────────────────────────────┐    │
│    │                    Durable Object: Session                         │    │
│    │  ┌──────────────┐    ┌──────────────┐                           │    │
│    │  │ Host Socket  │◄──►│ Client Socket │                           │    │
│    │  │   (Agent)    │    │   (Web UI)   │                           │    │
│    │  └──────┬───────┘    └──────┬───────┘                           │    │
│    └─────────┼────────────────────┼───────────────────────────────────┘    │
│              │                    │                                          │
│              │  Broadcasts events │                                          │
│              │  to opposite side │                                          │
│              ▼                    ▼                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                              WebSocket (WSS)
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            LOCAL AGENT (Node.js)                           │
│                         obs-websocket-js → OBS Studio                        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Event Listeners: SceneChanged, MuteState, Record, Stream, etc.    │   │
│  │  └────► normalizeToAlias() ──► full_sync / obs_event ──► Worker   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Command Handlers: ToggleMute, SetScene, ToggleVisibility, etc.    │   │
│  │  └────► findInputByName() ──► findAudioInputByType() ──► OBS      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### How the Triad Works

1. **Agent** connects to OBS locally and subscribes to all OBS events
2. **Agent** normalizes OBS data (e.g., "Audio del escritorio" → "Desktop Audio")
3. **Agent** sends `full_sync` and `obs_event` messages to Worker
4. **Worker** broadcasts events to all connected clients
5. **Web UI** receives events and updates React state in real-time
6. **Web UI** buttons highlight instantly when OBS state changes

### Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Web UI** | Next.js + React + Tailwind | Control interface, runs in browser |
| **Worker** | Cloudflare Workers + Durable Objects | WebSocket relay, session management |
| **Agent** | Node.js + obs-websocket-js | OBS connection, smart aliasing, event forwarding |

---

## Features

- **Live Bidirectional Sync**: Changes in OBS reflect immediately on mobile; mobile commands update OBS in real-time
- **Smart Audio Mapping**: Automatically maps "Desktop Audio" ↔ "Audio del escritorio" ↔ "Speakers" and "Mic/Aux" ↔ "Micrófono"
- **Import/Export JSON**: Backup and restore your button configuration as a JSON file
- **Universal Access**: Control OBS from mobile, tablet, or desktop browsers
- **Zero Configuration**: Connect from any device using a simple pairing code
- **Customizable Controls**: Create buttons for scenes, sources, filters, recording, and streaming
- **Master Controls**: Always-visible buttons for Mic, Desktop Audio, Record, and Stream
- **Visual Feedback**: Active states shown with color changes and glow effects
- **Mobile Optimized**: Haptic feedback and touch-friendly interface
- **Dark/Light Mode**: Automatic theme switching
- **Drag & Drop**: Reorder buttons to match your workflow
- **Multi-language**: English and Spanish support

---

## Smart Audio Mapping

DockForLife uses **bidirectional alias normalization** to handle OBS in any language:

### Supported Aliases

| Canonical Name | Spanish Variants | English Variants |
|----------------|------------------|------------------|
| **Desktop Audio** | Audio del escritorio, Audio de escritorio | Desktop Audio, Speakers, Output |
| **Mic/Aux** | Micrófono/Auxiliar, Mic | Mic/Aux, Microphone, Input |

### How It Works

**Agent → Web (Events):**
```
OBS: "Audio del escritorio" → normalizeToAlias() → "Desktop Audio" → Web UI ✓
```

**Web → Agent (Commands):**
```
Web: "Desktop Audio" → findInputByName() → "Audio del escritorio" → OBS ✓
```

This means:
- OBS can be in Spanish, English, or any language
- Your Web UI buttons always use consistent names ("Desktop Audio", "Mic/Aux")
- Buttons highlight correctly regardless of OBS language settings

---

## Worker Configuration

### Default Worker

The project is configured to use the default deployment:

```
remote.daurydicaprio.com → Cloudflare Worker → dockforlife-relay.prod.workers.dev
```

### Custom Worker Deployment

To deploy your own Worker:

#### 1. Configure Worker URL

**In `lib/config.ts`:**
```typescript
workerUrl: 'wss://your-worker-name.your-subdomain.workers.dev/ws'
```

**In `config.example.json`:**
```json
{
  "WORKER_URL": "wss://your-worker-name.your-subdomain.workers.dev/ws"
}
```

#### 2. Deploy with Wrangler

```bash
cd worker

# Install dependencies
npm install

# Configure wrangler.toml with your Cloudflare account
# Edit name = "your-worker-name"

# Deploy to production
npx wrangler deploy

# Or deploy to preview
npx wrangler deploy --env preview
```

#### 3. Update Agent Configuration

Create `agent/config.json`:
```json
{
  "WORKER_URL": "wss://your-worker-name.your-subdomain.workers.dev/ws",
  "OBS_PORT": 4455,
  "OBS_PASSWORD": "your-obs-password"
}
```

---

## Setup Guide

### 1. Web Application (Next.js)

```bash
# Clone and install
git clone https://github.com/daurydicaprio/dockforlife.git
cd dockforlife
npm install

# Development with hot reload
npm run dev

# Build for production
npm run build

# Deploy to Vercel (auto-detected)
vercel deploy

# Or deploy static build to any hosting
npx next export -o dist/
```

### 2. Cloudflare Worker

```bash
cd worker

# Install Wrangler CLI globally if needed
npm install -g wrangler

# Login to Cloudflare
npx wrangler login

# Deploy
npx wrangler deploy

# Check status
npx wrangler deployments
```

### 3. Local Agent (Development)

```bash
cd agent

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run in development mode (with ts-node)
npm run dev

# Or run compiled JavaScript
npm start
```

#### Arch Linux / Omarchy Setup

```bash
# Install Node.js from official repositories
sudo pacman -S nodejs npm

# Or use nvm for version management
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18

# Proceed with npm install && npm run dev as above
```

---

## Usage Modes

### Local Mode (Desktop)

Connect directly to OBS on the same computer using WebSocket (port 4455). Best for:
- Desktop/laptop control
- Testing and development
- Direct low-latency connection

### Remote Mode (Mobile)

Connect through the Cloudflare Worker relay using a pairing code. Best for:
- Mobile/tablet control from anywhere
- Remote streaming management
- Multi-device setups

---

## Creating Custom Buttons

1. Click the **+** button to add a new control
2. Choose an action type:
   - **Mute**: Toggle audio input mute state
   - **Visibility**: Toggle source visibility in current scene
   - **Filter**: Toggle filter on/off
   - **Scene**: Switch to a specific scene
   - **Record**: Start/stop recording
   - **Stream**: Start/stop streaming
3. Configure the target (scene name, source name, etc.)
4. Customize colors for idle and active states
5. Save and rearrange by dragging

Double-tap any button to edit its configuration.

---

## Import / Export Configuration

### Export Configuration

1. Open Settings Modal
2. Click **Export**
3. JSON file downloads automatically with timestamp
4. File contains all custom buttons (excludes master controls)

### Import Configuration

1. Open Settings Modal
2. Click **Import**
3. Select a valid `.json` config file
4. Buttons are merged with master controls

### JSON Format

```json
{
  "version": "1.0",
  "deck": [
    {
      "id": "abc123",
      "label": "GAME MIC",
      "type": "Mute",
      "target": "Mic/Aux",
      "color": "#18181b",
      "colorActive": "#3b82f6"
    }
  ]
}
```

---

## Security

- **Pairing Codes**: Unique 4-12 character codes for each session
- **No Data Collection**: All data stays local, no analytics or tracking
- **WSS Encryption**: All remote connections use secure WebSockets
- **Local Storage**: Settings stored in browser localStorage only

---

## Architecture Details

### Web Application
- **Framework**: Next.js 14 with TypeScript
- **Styling**: Tailwind CSS with custom components
- **State**: React hooks with localStorage persistence
- **Icons**: Lucide React
- **Real-time**: WebSocket message handlers for live updates

### Cloudflare Worker
- **Runtime**: Cloudflare Workers (edge computing)
- **Protocol**: WebSocket relay for real-time communication
- **Durable Objects**: Session management for pairing codes
- **CORS**: Configured for cross-origin requests

### Local Agent
- **Runtime**: Node.js 18+
- **OBS Connection**: obs-websocket-js library
- **Protocol**: WebSocket client to Cloudflare Worker
- **Smart Features**: normalizeToAlias(), findInputByName()
- **Event Broadcasting**: Real-time OBS event relay

---

## Troubleshooting

**Connection Failed:**
- Verify OBS WebSocket is enabled in Tools → WebSocket Server Settings
- Check the port (default: 4455) and password match your config
- Ensure firewall allows the connection

**Agent Not Running:**
- Check that the agent is still running in the terminal
- Verify the Worker URL is accessible
- Try regenerating the pairing code

**Buttons Not Responding:**
- Ensure OBS is running and WebSocket server is active
- Check browser console for error messages
- Refresh the page to reconnect

**Mobile Not Syncing:**
- Check browser console for `obs_event` or `full_sync` logs
- Verify Agent is sending events (check agent terminal)
- Confirm Worker is broadcasting (check Worker logs)

---

## License

This project is licensed under the **Sustainable Use License** - see [LICENSE](LICENSE) for details.

### Summary
- ✅ Free for personal use
- ✅ Free for educational purposes
- ✅ Free for open-source projects
- ✅ Free for internal business operations
- ❌ Cannot be used as a SaaS product
- ❌ Cannot be used as a hosted/managed service
- ❌ Cannot be sold or commercially redistributed

For commercial licensing inquiries, contact: [hello@daurydicaprio.com](mailto:hello@daurydicaprio.com)

---

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests.

## Support

- 💖 [Donate via PayPal](https://paypal.me/daurydicaprio)
- 🐛 [Report Issues](https://github.com/daurydicaprio/dockforlife/issues)
- 💬 [Discussions](https://github.com/daurydicaprio/dockforlife/discussions)

---

Made with ❤️ by **Daury DiCaprio**

#dockforlife
