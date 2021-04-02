import { globals } from "LuauAST/impl/globals";

const RUNTIME_LIB_ID = "TS";
const TEMP_IDENTIFIER_REGEX = /^_\d+$/;

const RESERVED_GLOBALS = new Set<string>();

for (const globalName of Object.keys(globals)) {
	RESERVED_GLOBALS.add(globalName);
}

export function isReservedIdentifier(id: string) {
	return id === RUNTIME_LIB_ID || RESERVED_GLOBALS.has(id) || TEMP_IDENTIFIER_REGEX.test(id);
}
