# DockForLife

Professional OBS Remote Control with Zero Configuration.

## 🏗️ Architecture

```
┌─────────────────┐     ┌───────────────────┐     ┌─────────────────┐
│   Browser/      │────>│  Cloudflare       │────>│  Go Agent       │
│   Mobile Device │     │  Worker (Relay)   │     │  (Local Host)   │
└─────────────────┘     └───────────────────┘     └─────────────────┘
        │                                               │
        │                                               ▼
        │                                         ┌───────────┐
        └─────────────────────────────────────────│ OBS Studio│
                                                  └───────────┘
```

## 🚀 Quick Start

### Prerequisites

- **OBS Studio** with WebSocket Server enabled (Tools → WebSocket Server Settings)
- **Go 1.21+** (for running the local agent)
- **Node.js 18+** (for web development)

### 1. Clone and Setup

```bash
git clone https://github.com/daurydicaprio/dockforlife.git
cd dockforlife

# Install web dependencies
npm install

# Install worker dependencies
cd worker && npm install && cd ..
```

### 2. Environment Configuration

#### WebApp (.env.local)
Copy the example file and customize:

```bash
cp .env.example .env.local
```

**Variables:**
| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_WORKER_URL` | Cloudflare Worker WebSocket URL | Provided worker |
| `NEXT_PUBLIC_OBS_URL` | Local OBS WebSocket URL | `ws://127.0.0.1:4455` |

#### Agent (proxy/config.json)
Copy the example file and customize:

```bash
cp proxy/config.example.json proxy/config.json
```

**Structure:**
```json
{
  "obs": {
    "url": "ws://127.0.0.1:4455",
    "password": "your_obs_password_if_any"
  },
  "worker": {
    "url": "wss://dockforlife-relay.blu-b1d.workers.dev/ws"
  }
}
```

### 3. Run the Agent

#### Arch Linux (AMD64)
```bash
cd proxy
chmod +x dockforlife-agent
./dockforlife-agent -code=YOURCODE
```

#### Other Platforms
```bash
cd proxy
make build
./bin/linux/agent -code=YOURCODE
```

**Flags:**
| Flag | Description | Default |
|------|-------------|---------|
| `-code` | Join code for pairing | Auto-generated |
| `-obs` | OBS WebSocket URL | `ws://127.0.0.1:4455` |
| `-worker` | Worker WebSocket URL | From config |

### 4. Start WebApp

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Deploy Worker (Optional)

If you want your own relay worker:

```bash
cd worker
npx wrangler deploy
```

## 🔧 Development

### Build Commands

```bash
# WebApp
npm run dev      # Development server
npm run build    # Production build
npm run start    # Production server

# Agent
cd proxy
make build       # Build for all platforms
make build-linux # Build for Linux only

# Worker
cd worker
npx wrangler dev # Local development
npx wrangler deploy # Deploy to production
```

## 🎨 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS 4, Radix UI |
| Backend | Cloudflare Workers (WebSocket Relay) |
| Agent | Go 1.21 |
| Communication | OBS WebSocket 5.x |

## 🛡️ Security

- **100% Local**: All data stored in browser localStorage
- **No Collection**: No personal data transmitted
- **Direct Connection**: Connects directly to OBS on local network
- **Offline Capable**: Works offline once loaded

## 📱 Usage

1. **Host (PC with OBS)**:
   - Run the agent: `./dockforlife-agent`
   - Note the 8-character join code

2. **Client (Phone/Tablet)**:
   - Open the web app
   - Enter the join code
   - Tap CONNECT

## 🌍 Internationalization

DockForLife automatically detects your browser language:
- **English** (default)
- **Español** (when `navigator.language` starts with 'es')

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 👨‍💻 Author

Made with love by [Daury DiCaprio](https://daurydicaprio.com)

---

**#verygoodforlife**
