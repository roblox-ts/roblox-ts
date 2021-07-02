import { globals } from "LuauAST/impl/globals";

const RESERVED_GLOBALS = new Set<string>();

for (const globalName of Object.keys(globals)) {
	RESERVED_GLOBALS.add(globalName);
}

export function isReservedIdentifier(id: string) {
	return RESERVED_GLOBALS.has(id);
}
