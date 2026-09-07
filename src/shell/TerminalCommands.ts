export interface TerminalCommandDefinition {
  name: string;
  aliases?: readonly string[];
}

export const terminalCommandDefinitions = [
  { name: "help" },
  { name: "man" },
  { name: "ls" },
  { name: "cd" },
  { name: "pwd" },
  { name: "cat" },
  { name: "tree" },
  { name: "log" },
  { name: "trace" },
  { name: "worm", aliases: ["c2"] },
  { name: "history" },
  { name: "echo" },
  { name: "date" },
  { name: "uname" },
  { name: "which" },
  { name: "open" },
  { name: "exit", aliases: ["logout"] },
  { name: "map" },
  { name: "goto" },
  { name: "tp", aliases: ["teleport"] },
  { name: "whoami" },
  { name: "portfolio", aliases: ["projects"] },
  { name: "zone" },
  { name: "quality" },
  { name: "speed" },
  { name: "noclip" },
  { name: "debug" },
  { name: "colliders", aliases: ["collision", "hitboxes"] },
  { name: "respawn", aliases: ["home"] },
  { name: "spark" },
  { name: "spell" },
  { name: "surge" },
  { name: "thunder" },
  { name: "override" },
  { name: "packet" },
  { name: "reset" },
  { name: "lantern" },
  { name: "ritual" },
  { name: "sudo" },
  { name: "clear" },
] as const satisfies readonly TerminalCommandDefinition[];

const canonicalCommandByName = new Map<string, string>();
for (const definition of terminalCommandDefinitions) {
  canonicalCommandByName.set(definition.name, definition.name);
  const aliases = "aliases" in definition ? definition.aliases : [];
  for (const alias of aliases) {
    canonicalCommandByName.set(alias, definition.name);
  }
}

export const terminalCommandNames = [
  ...canonicalCommandByName.keys(),
] as readonly string[];

export function resolveTerminalCommandName(value: string): string {
  const normalized = value.trim().toLowerCase();
  return canonicalCommandByName.get(normalized) ?? normalized;
}

export function isTerminalCommandName(value: string): boolean {
  return canonicalCommandByName.has(value.trim().toLowerCase());
}
