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
  WORKER_URL: 'wss://your-worker.your-subdomain.workers.dev/ws',
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

if (process.env.WORKER_URL) config.WORKER_URL = process.env.WORKER_URL;
if (process.env.OBS_PORT) config.OBS_PORT = parseInt(process.env.OBS_PORT);
if (process.env.OBS_PASSWORD) config.OBS_PASSWORD = process.env.OBS_PASSWORD;

const obs = new OBSWebSocket();
let ws: WebSocket | null = null;
let joinCode = '';
let isOBSConnected = false;

function broadcastToWorker(data: any) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function setupOBSEventListeners() {
  if (!obs) return;

  obs.on('CurrentProgramSceneChanged', (data: any) => {
    console.log('OBS Event: Scene changed to', data.sceneName);
    broadcastToWorker({
      type: 'obs_event',
      eventType: 'CurrentProgramSceneChanged',
      eventData: { sceneName: data.sceneName }
    });
  });

  obs.on('InputMuteStateChanged', (data: any) => {
    console.log('OBS Event: Mute changed for', data.inputName, data.inputMuted);
    broadcastToWorker({
      type: 'obs_event',
      eventType: 'InputMuteStateChanged',
      eventData: { inputName: data.inputName, inputMuted: data.inputMuted }
    });
  });

  obs.on('RecordStateChanged', (data: any) => {
    console.log('OBS Event: Record state changed:', data.outputState);
    broadcastToWorker({
      type: 'obs_event',
      eventType: 'RecordStateChanged',
      eventData: { outputState: data.outputState }
    });
  });

  obs.on('StreamStateChanged', (data: any) => {
    console.log('OBS Event: Stream state changed:', data.outputState);
    broadcastToWorker({
      type: 'obs_event',
      eventType: 'StreamStateChanged',
      eventData: { outputState: data.outputState }
    });
  });

  obs.on('SceneItemEnableStateChanged', (data: any) => {
    console.log('OBS Event: Visibility changed:', data.sceneName, data.sceneItemId, data.sceneItemEnabled);
    broadcastToWorker({
      type: 'obs_event',
      eventType: 'SceneItemEnableStateChanged',
      eventData: {
        sceneName: data.sceneName,
        sceneItemId: data.sceneItemId,
        sceneItemEnabled: data.sceneItemEnabled
      }
    });
  });

  obs.on('SourceFilterEnableStateChanged', (data: any) => {
    console.log('OBS Event: Filter changed:', data.sourceName, data.filterName, data.filterEnabled);
    broadcastToWorker({
      type: 'obs_event',
      eventType: 'SourceFilterEnableStateChanged',
      eventData: {
        sourceName: data.sourceName,
        filterName: data.filterName,
        filterEnabled: data.filterEnabled
      }
    });
  });

  console.log('OBS event listeners registered');
}

async function sendFullSync() {
  if (!isOBSConnected) return;

  try {
    const [sceneList, inputList, rec, str, currentProgram] = await Promise.all([
      obs.call('GetSceneList') as any,
      obs.call('GetInputList') as any,
      obs.call('GetRecordStatus') as any,
      obs.call('GetStreamStatus') as any,
      obs.call('GetCurrentProgramScene') as any
    ]);

    const allSources = new Set<string>();
    for (const input of inputList.inputs as any[]) {
      if (input.inputName) {
        allSources.add(String(input.inputName));
      }
    }

    for (const scene of sceneList.scenes as any[]) {
      try {
        const { sceneItems } = await obs.call('GetSceneItemList', { sceneName: String(scene.sceneName) }) as any;
        sceneItems.forEach((si: any) => {
          if (si.sourceName) allSources.add(String(si.sourceName));
        });
      } catch {}
    }

    const muteStates: Record<string, boolean> = {};
    for (const input of inputList.inputs as any[]) {
      try {
        const inputName = String(input.inputName || '');
        const { inputMuted } = await obs.call('GetInputMute', { inputName }) as any;
        (muteStates as any)[inputName] = Boolean(inputMuted);
      } catch {}
    }

    const visibilityStates: Record<string, boolean> = {};
    const currentSceneName = String(currentProgram.currentProgramSceneName || '');
    if (currentSceneName) {
      try {
        const { sceneItems } = await obs.call('GetSceneItemList', { sceneName: currentSceneName }) as any;
        for (const item of sceneItems) {
          const key = `${currentSceneName}-${Number(item.sceneItemId || 0)}`;
          (visibilityStates as any)[key] = Boolean(item.sceneItemEnabled);
        }
      } catch {}
    }

    const fullSync = {
      type: 'full_sync',
      scenes: sceneList.scenes.map((s: any) => ({ sceneName: s.sceneName })),
      inputs: inputList.inputs.map((i: any) => ({ inputName: i.inputName })),
      allSources: Array.from(allSources),
      currentScene: currentProgram.currentProgramSceneName || '',
      muteStates,
      visibilityStates,
      filterStates: {},
      rec: rec.outputActive || false,
      str: str.outputActive || false
    };

    console.log('Sending full_sync:', fullSync.scenes.length, 'scenes,', fullSync.inputs.length, 'inputs');
    broadcastToWorker(fullSync);

  } catch (e) {
    console.error('Error sending full sync:', e);
  }
}

async function connectToOBS() {
  try {
    await obs.connect(`ws://127.0.0.1:${config.OBS_PORT}`, config.OBS_PASSWORD);
    console.log(`Connected to OBS on port ${config.OBS_PORT}`);
    isOBSConnected = true;
    setupOBSEventListeners();
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
          obs.call('GetRecordStatus') as any,
          obs.call('GetStreamStatus') as any
        ]);
        ws?.send(JSON.stringify({
          type: 'obs_status',
          rec: Boolean(rec.outputActive),
          str: Boolean(str.outputActive)
        }));
      } else if (msg.type === 'request_full_sync') {
        console.log('Received full_sync request');
        await sendFullSync();
      } else if (msg.type === 'peer_connected') {
        console.log('Client connected!');
        await sendFullSync();
      }
    } catch (e) {
      console.error('Error handling message:', e);
    }
  });

  ws.on('close', () => {
    console.log('Disconnected from relay. Reconnecting in 3s...');
    isOBSConnected = false;
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
        await obs.call('ToggleRecord') as any;
        break;
      case 'Stream':
        await obs.call('ToggleStream') as any;
        break;
      case 'Scene':
        if (msg.args?.target) {
          await obs.call('SetCurrentProgramScene', { sceneName: String(msg.args.target) }) as any;
        }
        break;
      case 'Mute':
        if (msg.args?.target) {
          await obs.call('ToggleInputMute', { inputName: String(msg.args.target) }) as any;
        }
        break;
      case 'Visibility':
        if (msg.args?.target && msg.args?.enabled !== undefined) {
          const progResult = await obs.call('GetCurrentProgramScene') as any;
          const currentProgramSceneName = String(progResult.currentProgramSceneName || '');
          const { sceneItems } = await obs.call('GetSceneItemList', { sceneName: currentProgramSceneName }) as any;
          const item = sceneItems.find((i: any) => i.sourceName === msg.args.target);
          if (item) {
            await obs.call('SetSceneItemEnabled', {
              sceneName: currentProgramSceneName,
              sceneItemId: Number(item.sceneItemId || 0),
              sceneItemEnabled: Boolean(msg.args.enabled)
            }) as any;
          }
        }
        break;
      case 'Filter':
        if (msg.args?.target && msg.args?.filter && msg.args?.enabled !== undefined) {
          await obs.call('SetSourceFilterEnabled', {
            sourceName: String(msg.args.target),
            filterName: String(msg.args.filter),
            filterEnabled: Boolean(msg.args.enabled)
          });
        }
        break;
    }
  } catch (e) {
    console.error('OBS execution error:', e);
  }
}

(async () => {
  await connectToOBS();
  connectToWorker();
})();
