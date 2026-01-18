import {
  Command,
  CommandType,
  isCommandType,
  MuteCommand,
  SceneCommand,
  VisibilityCommand,
  FilterCommand,
} from "./obs-contract";

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateCommand(cmd: Partial<Command>): ValidationResult {
  if (!cmd || !cmd.type) {
    return { valid: false, reason: "Command missing type" };
  }

  if (!isCommandType(cmd.type)) {
    return { valid: false, reason: `Invalid command type: ${cmd.type}` };
  }

  switch (cmd.type) {
    case "mute":
      return validateMuteCommand(cmd);
    case "scene":
      return validateSceneCommand(cmd);
    case "record":
      return { valid: true };
    case "stream":
      return { valid: true };
    case "visibility":
      return validateVisibilityCommand(cmd);
    case "filter":
      return validateFilterCommand(cmd);
    default:
      return { valid: false, reason: "Unknown command type" };
  }
}

function validateMuteCommand(cmd: Partial<Command>): ValidationResult {
  const muteCmd = cmd as MuteCommand;
  if (!muteCmd.target || muteCmd.target.trim() === "") {
    return { valid: false, reason: "Mute command requires non-empty target" };
  }
  return { valid: true };
}

function validateSceneCommand(cmd: Partial<Command>): ValidationResult {
  const sceneCmd = cmd as SceneCommand;
  if (!sceneCmd.target || sceneCmd.target.trim() === "") {
    return { valid: false, reason: "Scene command requires non-empty target" };
  }
  return { valid: true };
}

function validateVisibilityCommand(cmd: Partial<Command>): ValidationResult {
  const visCmd = cmd as VisibilityCommand;
  if (!visCmd.target || visCmd.target.trim() === "") {
    return { valid: false, reason: "Visibility command requires non-empty target" };
  }
  return { valid: true };
}

function validateFilterCommand(cmd: Partial<Command>): ValidationResult {
  const filterCmd = cmd as FilterCommand;
  if (!filterCmd.target || filterCmd.target.trim() === "") {
    return { valid: false, reason: "Filter command requires non-empty target" };
  }
  if (!filterCmd.filter || filterCmd.filter.trim() === "") {
    return { valid: false, reason: "Filter command requires non-empty filter name" };
  }
  return { valid: true };
}

export function createCommand(
  type: CommandType,
  options: {
    target?: string;
    filter?: string;
    value?: boolean;
  } = {}
): Command {
  const base = {
    type,
    timestamp: Date.now(),
    ...options,
  };

  switch (type) {
    case "mute":
      if (!options.target) {
        throw new Error("Mute command requires target");
      }
      return { ...base, type: "mute", target: options.target } as MuteCommand;
    case "scene":
      if (!options.target) {
        throw new Error("Scene command requires target");
      }
      return { ...base, type: "scene", target: options.target } as SceneCommand;
    case "record":
      return { type: "record", timestamp: Date.now() };
    case "stream":
      return { type: "stream", timestamp: Date.now() };
    case "visibility":
      if (!options.target) {
        throw new Error("Visibility command requires target");
      }
      return {
        ...base,
        type: "visibility",
        target: options.target,
        value: options.value,
      } as VisibilityCommand;
    case "filter":
      if (!options.target || !options.filter) {
        throw new Error("Filter command requires target and filter");
      }
      return {
        ...base,
        type: "filter",
        target: options.target,
        filter: options.filter,
        value: options.value,
      } as FilterCommand;
    default:
      throw new Error(`Unknown command type: ${type}`);
  }
}

export function commandToString(cmd: Command): string {
  const parts = [`type=${cmd.type}`];
  if (cmd.target) parts.push(`target=${cmd.target}`);
  if (cmd.filter) parts.push(`filter=${cmd.filter}`);
  if ("value" in cmd && cmd.value !== undefined) parts.push(`value=${cmd.value}`);
  return `[PHASE2] Command: ${parts.join(" ")}`;
}
