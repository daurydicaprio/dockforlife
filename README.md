# DockForLife

[![Version](https://img.shields.io/badge/version-v0.1.0--alpha-blue.svg)](https://github.com/daurydicaprio/dockforlife)
[![License](https://img.shields.io/badge/license-Sustainable%20Use-orange.svg)](LICENSE)

Professional OBS Remote Controller with Zero Configuration.

Control your OBS Studio from any device—mobile, tablet, or desktop—without complicated network setup. DockForLife uses a Cloudflare Worker relay to enable seamless remote control from anywhere.

## Architecture

```
┌─────────────┐      WebSocket      ┌─────────────────┐      WebSocket      ┌─────────────┐
│   Web App   │ ◄─────────────────► │  Cloudflare     │ ◄─────────────────► │ Local Agent │
│  (Browser)  │   (WSS/Internet)    │  Worker (Relay) │   (WSS/Localhost)   │  (Node.js)  │
└─────────────┘                     └─────────────────┘                     └──────┬──────┘
                                                                                    │
                                                                                    │ WebSocket
                                                                                    │
                                                                               ┌────┴────┐
                                                                               │   OBS   │
                                                                               │ Studio  │
                                                                               └─────────┘
```

### Components

1. **Web Application (Next.js)** - The control interface that runs in any modern browser
2. **Cloudflare Worker** - WebSocket relay that bridges connections between devices
3. **Local Agent** - Lightweight Node.js application that connects to OBS locally
4. **OBS Studio** - Your streaming software with WebSocket server enabled

## Features

- **Zero Configuration**: Connect from any device using a simple pairing code
- **Universal Access**: Control OBS from mobile, tablet, or desktop browsers
- **Real-time Sync**: Bi-directional state synchronization with OBS
- **Customizable Controls**: Create buttons for scenes, sources, filters, recording, and streaming
- **Master Controls**: Always-visible buttons for Mic, Desktop Audio, Record, and Stream
- **Visual Feedback**: Active states shown with color changes and black borders
- **Mobile Optimized**: Haptic feedback and touch-friendly interface
- **Dark/Light Mode**: Automatic theme switching
- **Drag & Drop**: Reorder buttons to match your workflow
- **Multi-language**: English and Spanish support

## Quick Start

### Prerequisites

- OBS Studio with [obs-websocket](https://github.com/obsproject/obs-websocket) plugin (v5.x)
- Node.js 18+ (for development)
- One of the standalone agent binaries (for users)

### Option 1: Standalone Agent (Recommended for Users)

Download the pre-built binary for your platform:

- **Windows**: `dockforlife-agent-win.exe`
- **Linux**: `dockforlife-agent-linux`
- **macOS**: `dockforlife-agent-mac`

1. Download from [GitHub Releases](https://github.com/daurydicaprio/dockforlife/releases)
2. Run the agent on the computer with OBS
3. The agent will display a pairing code
4. Open [dockforlife.vercel.app](https://dockforlife.vercel.app) on your mobile device
5. Enter the pairing code in Settings → Remote Mode
6. Start controlling OBS!

### Option 2: Development Setup

```bash
# Clone the repository
git clone https://github.com/daurydicaprio/dockforlife.git
cd dockforlife

# Install dependencies
npm install

# Copy example configuration
cp config.example.json config.json

# Configure your OBS WebSocket settings in config.json
# {
#   "WORKER_URL": "wss://your-worker-url.workers.dev/ws",
#   "OBS_PORT": 4455,
#   "OBS_PASSWORD": "your-obs-password"
# }

# Start the development server
npm run dev

# In a separate terminal, start the agent
cd agent
npm install
npm run build
npm start
```

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

## Security

- **Pairing Codes**: Unique 4-12 character codes for each session
- **No Data Collection**: All data stays local, no analytics or tracking
- **WSS Encryption**: All remote connections use secure WebSockets
- **Local Storage**: Settings stored in browser localStorage only

## Architecture Details

### Web Application
- **Framework**: Next.js 14 with TypeScript
- **Styling**: Tailwind CSS with custom components
- **State**: React hooks with localStorage persistence
- **Icons**: Lucide React

### Cloudflare Worker
- **Runtime**: Cloudflare Workers (edge computing)
- **Protocol**: WebSocket relay for real-time communication
- **Durable Objects**: Session management for pairing codes
- **CORS**: Configured for cross-origin requests

### Local Agent
- **Runtime**: Node.js 18+
- **OBS Connection**: obs-websocket-js library
- **Protocol**: WebSocket client to Cloudflare Worker
- **Platforms**: Windows, Linux, macOS binaries available

## Building from Source

### Build Agent Binaries
```bash
cd agent
npm ci
npm run build
npx pkg . --targets node18-win-x64,node18-linux-x64,node18-macos-x64 --out-path ./dist
```

### Deploy Web App
```bash
# Deploy to Vercel
vercel deploy

# Or build for static hosting
next build
```

### Deploy Worker
```bash
cd worker
wrangler deploy
```

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

For commercial licensing inquiries, contact: [contact@dockforlife.app](mailto:contact@dockforlife.app)

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests.

## Support

- 💖 [Donate via PayPal](https://paypal.me/daurydicaprio)
- 🐛 [Report Issues](https://github.com/daurydicaprio/dockforlife/issues)
- 💬 [Discussions](https://github.com/daurydicaprio/dockforlife/discussions)

## Acknowledgments

Made with ❤️ by **Daury DiCaprio**

#verygoodforlife
