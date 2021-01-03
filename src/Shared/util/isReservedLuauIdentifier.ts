const RUNTIME_LIB_ID = "TS";
const TEMP_IDENTIFIER_REGEX = /^_\d+$/;

export function isReservedLuauIdentifier(id: string) {
	return id === RUNTIME_LIB_ID || TEMP_IDENTIFIER_REGEX.test(id);
}
