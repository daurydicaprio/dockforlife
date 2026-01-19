# DockForLife

Professional OBS remote control with Zero Configuration.

## Overview

DockForLife is a web-based OBS Studio controller that enables seamless remote control from any device on your local network. Built with Next.js and Cloudflare Workers.

### Key Features

- **Magic Handshake**: Automatic Join Code generation - no manual configuration
- **Dual-Mode**: Maintain local OBS connection while using remote features
- **Bilingual**: Automatic English/Spanish detection based on browser language
- **Zero Config**: Fixed worker URL, no user input required
- **Privacy-First**: 100% local data storage, no external data collection

## Quick Start

### 1. Download the Agent

Download the appropriate binary for your system from [GitHub Releases](https://github.com/daurydicaprio/dockforlife/releases):

- **Windows**: `dockforlife-proxy-windows-amd64.exe`
- **Linux**: `dockforlife-proxy-linux-amd64`
- **macOS**: `dockforlife-proxy-darwin-*`

### 2. Run the Agent

```bash
# Linux
chmod +x dockforlife-proxy-linux-amd64
./dockforlife-proxy-linux-amd64

# Windows (Command Prompt)
dockforlife-proxy-windows-amd64.exe

# macOS
chmod +x dockforlife-proxy-darwin-amd64
./dockforlife-proxy-darwin-amd64
```

### 3. Open the Web App

Navigate to [https://dockforlife.app](https://dockforlife.app) in your browser.

### 4. Connect

1. Click the Settings icon (gear)
2. Toggle "Remote Mode" to generate a Join Code
3. Share the code with other devices
4. Enter the code on the client device to connect

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Browser   │────>│  Cloudflare  │────>│  Go Proxy   │
│   (Web UI)  │     │    Worker    │     │   Agent     │
└─────────────┘     └──────────────┘     └─────────────┘
                                                  │
                                                  ▼
                                            ┌───────────┐
                                            │ OBS Studio│
                                            └───────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS 4, Radix UI |
| Backend | Cloudflare Workers (WebSocket Relay) |
| Agent | Go 1.21 |
| Communication | OBS WebSocket 5.x |

## Development

### Prerequisites

- Node.js 18+
- Go 1.21+
- Cloudflare Wrangler CLI

### Setup

```bash
# Clone the repository
git clone https://github.com/daurydicaprio/dockforlife.git
cd dockforlife

# Install web dependencies
npm install

# Install worker dependencies
cd worker && npm install && cd ..

# Run development server
npm run dev
```

### Deploy Worker

```bash
cd worker
npm run deploy
```

## Security

- All data is stored locally in your browser (localStorage)
- No personal information is collected or transmitted
- Direct connection to OBS on your local network
- Works offline once loaded

## License

MIT License - see [LICENSE](LICENSE) for details.

## Author

Made with love by [Daury DiCaprio](https://daurydicaprio.com)

---

**#verygoodforlife**
