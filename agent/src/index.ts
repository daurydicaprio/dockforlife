import OBSWebSocket from 'obs-websocket-js';
import WebSocket from 'ws';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Load config
interface Config {
  WORKER_URL: string;
  OBS_PORT: number;
  OBS_PASSWORD?: string;
}

let config: Config = {
  WORKER_URL: 'wss://your-worker.your-subdomain.workers.dev/ws', // Default, should be overwritten
  OBS_PORT: 4455,
  OBS_PASSWORD: ''
};

const configPath = join(process.cwd(), 'config.json');
if (existsSync(configPath)) {
  try {
    const fileConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    config = { ...config, ...fileConfig };
    console.log('Loaded config from config.json');
  } catch (e) {
    console.error('Error reading config.json:', e);
  }
} else {
  console.log('No config.json found, using defaults/env vars');
}

// Override with env vars if present
if (process.env.WORKER_URL) config.WORKER_URL = process.env.WORKER_URL;
if (process.env.OBS_PORT) config.OBS_PORT = parseInt(process.env.OBS_PORT);
if (process.env.OBS_PASSWORD) config.OBS_PASSWORD = process.env.OBS_PASSWORD;

const obs = new OBSWebSocket();
let ws: WebSocket | null = null;
let joinCode = '';

async function connectToOBS() {
  try {
    await obs.connect(`ws://127.0.0.1:${config.OBS_PORT}`, config.OBS_PASSWORD);
    console.log(`Connected to OBS on port ${config.OBS_PORT}`);
    return true;
  } catch (error: any) {
    console.error('Failed to connect to OBS:', error.message);
    console.log('Retrying in 5 seconds...');
    setTimeout(connectToOBS, 5000);
    return false;
  }
}

function connectToWorker() {
  if (!joinCode) {
    // Generate a random 6-char code if not provided via args (simplified for now)
    // Ideally, the user provides this or we generate one and show it in console
    joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    console.log('----------------------------------------');
    console.log(`YOUR PAIRING CODE: ${joinCode}`);
    console.log('----------------------------------------');
  }

  const url = `${config.WORKER_URL}?code=${joinCode}&role=host`;
  console.log(`Connecting to relay: ${url}`);
  
  ws = new WebSocket(url);

  ws.on('open', () => {
    console.log('Connected to DockForLife Relay');
    // Send initial handshake
    ws?.send(JSON.stringify({ type: 'register', code: joinCode, role: 'host' }));
  });

  ws.on('message', async (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());
      
        if (msg.type === 'obs_command') {
        console.log('Received command:', msg.command);
        handleObsCommand(msg);
      } else if (msg.type === 'request_status') {
        const [rec, str] = await Promise.all([
          obs.call('GetRecordStatus'),
          obs.call('GetStreamStatus')
        ]);
        ws?.send(JSON.stringify({
          type: 'obs_status',
          rec: rec.outputActive,
          str: str.outputActive
        }));
      } else if (msg.type === 'peer_connected') {
        console.log('Client connected!');
        // Send initial data immediately
        const scenes = await obs.call('GetSceneList');
        const inputs = await obs.call('GetInputList');
        
        // Log what we're sending to debug
        console.log(`Sending initial state: ${scenes.scenes.length} scenes, ${inputs.inputs.length} inputs`);
        
        ws?.send(JSON.stringify({
          type: 'obs_data',
          scenes: scenes.scenes.map(s => ({ sceneName: s.sceneName })),
          inputs: inputs.inputs.map(i => ({ inputName: i.inputName }))
        }));
      }
    } catch (e) {
      console.error('Error handling message:', e);
    }
  });

  ws.on('close', () => {
    console.log('Disconnected from relay. Reconnecting in 3s...');
    setTimeout(connectToWorker, 3000);
  });

  ws.on('error', (err) => {
    console.error('Relay connection error:', err.message);
  });
}

async function handleObsCommand(msg: any) {
  if (!obs.identified) return;

  try {
    switch (msg.command) {
      case 'Record':
        await obs.call('ToggleRecord');
        break;
      case 'Stream':
        await obs.call('ToggleStream');
        break;
      case 'Scene':
        if (msg.args?.target) {
          await obs.call('SetCurrentProgramScene', { sceneName: msg.args.target });
        }
        break;
      case 'Mute':
        if (msg.args?.target) {
          await obs.call('ToggleInputMute', { inputName: msg.args.target });
        }
        break;
      case 'Filter':
        // Simplified filter toggle logic would go here
        break;
    }
  } catch (e) {
    console.error('OBS execution error:', e);
  }
}

// Start
(async () => {
  await connectToOBS();
  connectToWorker();
})();
