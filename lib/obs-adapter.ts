import OBSWebSocket from "obs-websocket-js";
import {
  Command,
  isMuteCommand,
  isSceneCommand,
  isRecordCommand,
  isStreamCommand,
  isVisibilityCommand,
  isFilterCommand,
  CommandResult,
  SceneItemInfo,
} from "./obs-contract";

export interface OBSAdapter {
  execute(command: Command): Promise<CommandResult>;
  getCurrentScene(): Promise<string>;
}

export class OBSWebSocketAdapter implements OBSAdapter {
  private obs: OBSWebSocket;
  private currentSceneName: string = "";

  constructor(obs: OBSWebSocket) {
    this.obs = obs;
  }

  async execute(command: Command): Promise<CommandResult> {
    const startTime = Date.now();

    try {
      if (isRecordCommand(command)) {
        await this.obs.call("ToggleRecord");
        console.log("[PHASE2] Executed ToggleRecord");
        return {
          success: true,
          command,
          timestamp: Date.now(),
        };
      }

      if (isStreamCommand(command)) {
        await this.obs.call("ToggleStream");
        console.log("[PHASE2] Executed ToggleStream");
        return {
          success: true,
          command,
          timestamp: Date.now(),
        };
      }

      if (isSceneCommand(command)) {
        await this.obs.call("SetCurrentProgramScene", {
          sceneName: command.target,
        });
        console.log(`[PHASE2] Executed SetCurrentProgramScene sceneName=${command.target}`);
        this.currentSceneName = command.target;
        return {
          success: true,
          command,
          timestamp: Date.now(),
        };
      }

      if (isMuteCommand(command)) {
        await this.obs.call("ToggleInputMute", {
          inputName: command.target,
        });
        console.log(`[PHASE2] Executed ToggleInputMute inputName=${command.target}`);
        return {
          success: true,
          command,
          timestamp: Date.now(),
        };
      }

      if (isFilterCommand(command)) {
        const { filterEnabled } = await this.obs.call("GetSourceFilter", {
          sourceName: command.target,
          filterName: command.filter,
        });
        await this.obs.call("SetSourceFilterEnabled", {
          sourceName: command.target,
          filterName: command.filter,
          filterEnabled: !filterEnabled,
        });
        console.log(
          `[PHASE2] Executed SetSourceFilterEnabled sourceName=${command.target} filterName=${command.filter} filterEnabled=${!filterEnabled}`
        );
        return {
          success: true,
          command,
          timestamp: Date.now(),
        };
      }

      if (isVisibilityCommand(command)) {
        const currentScene = await this.getCurrentScene();
        const rawResponse = await this.obs.call("GetSceneItemList", {
          sceneName: currentScene,
        });
        const sceneItemsResponse = rawResponse as unknown as { sceneItems: SceneItemInfo[] };
        const sceneItems = sceneItemsResponse.sceneItems || [];
        const item = sceneItems.find((i) => i.sourceName === command.target);

        if (!item) {
          return {
            success: false,
            command,
            error: `Source "${command.target}" not found in scene "${currentScene}"`,
            timestamp: Date.now(),
          };
        }

        const sceneItemId = item.sceneItemId;
        const enabledRawResponse = await this.obs.call("GetSceneItemEnabled", {
          sceneName: currentScene,
          sceneItemId,
        });
        const enabledResponse = enabledRawResponse as unknown as { sceneItemEnabled: boolean };
        const sceneItemEnabled = enabledResponse.sceneItemEnabled;
        await this.obs.call("SetSceneItemEnabled", {
          sceneName: currentScene,
          sceneItemId,
          sceneItemEnabled: !sceneItemEnabled,
        });
        console.log(
          `[PHASE2] Executed SetSceneItemEnabled sceneName=${currentScene} sceneItemId=${sceneItemId} sceneItemEnabled=${!sceneItemEnabled}`
        );
        return {
          success: true,
          command,
          timestamp: Date.now(),
        };
      }

      return {
        success: false,
        command,
        error: "Unknown command type",
        timestamp: Date.now(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[PHASE2] Command failed: ${errorMessage}`);
      return {
        success: false,
        command,
        error: errorMessage,
        timestamp: Date.now(),
      };
    }
  }

  async getCurrentScene(): Promise<string> {
    if (this.currentSceneName) {
      return this.currentSceneName;
    }
    const { currentProgramSceneName } = await this.obs.call("GetCurrentProgramScene");
    this.currentSceneName = currentProgramSceneName;
    return currentProgramSceneName;
  }
}
