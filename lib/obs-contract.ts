export const CONTRACT_VERSION = "1.0.0";

export type CommandType =
  | "mute"
  | "scene"
  | "record"
  | "stream"
  | "visibility"
  | "filter";

export interface BaseCommand {
  type: CommandType;
  target?: string;
  filter?: string;
  timestamp: number;
}

export interface MuteCommand extends BaseCommand {
  type: "mute";
  target: string;
}

export interface SceneCommand extends BaseCommand {
  type: "scene";
  target: string;
}

export interface RecordCommand extends BaseCommand {
  type: "record";
}

export interface StreamCommand extends BaseCommand {
  type: "stream";
}

export interface VisibilityCommand extends BaseCommand {
  type: "visibility";
  target: string;
  value?: boolean;
}

export interface FilterCommand extends BaseCommand {
  type: "filter";
  target: string;
  filter: string;
  value?: boolean;
}

export type Command =
  | MuteCommand
  | SceneCommand
  | RecordCommand
  | StreamCommand
  | VisibilityCommand
  | FilterCommand;

export interface CommandResult {
  success: boolean;
  command: Command;
  error?: string;
  timestamp: number;
}

export interface OBSResponse<T = unknown> {
  data: T;
  requestType: string;
  requestId: string;
}

export interface SourceFilterInfo {
  filterName: string;
  filterEnabled: boolean;
  filterType: string;
  filterSettings: Record<string, unknown>;
}

export interface SceneItemInfo {
  sceneItemId: number;
  sourceName: string;
  sceneItemEnabled: boolean;
}

export interface SceneInfo {
  sceneName: string;
}

export interface InputInfo {
  inputName: string;
  inputKind: string;
}

export type AnyCommandType = Command["type"];

export function isCommandType(value: string): value is CommandType {
  return (
    value === "mute" ||
    value === "scene" ||
    value === "record" ||
    value === "stream" ||
    value === "visibility" ||
    value === "filter"
  );
}

export function isMuteCommand(cmd: Command): cmd is MuteCommand {
  return cmd.type === "mute";
}

export function isSceneCommand(cmd: Command): cmd is SceneCommand {
  return cmd.type === "scene";
}

export function isRecordCommand(cmd: Command): cmd is RecordCommand {
  return cmd.type === "record";
}

export function isStreamCommand(cmd: Command): cmd is StreamCommand {
  return cmd.type === "stream";
}

export function isVisibilityCommand(cmd: Command): cmd is VisibilityCommand {
  return cmd.type === "visibility";
}

export function isFilterCommand(cmd: Command): cmd is FilterCommand {
  return cmd.type === "filter";
}
