// X = reserved by TypeScript
const LUAU_RESERVED_KEYWORDS = new Set([
	"and",
	"break", // X
	"do", // X
	"else", // X
	"elseif",
	"end",
	"false", // X
	"for", // X
	"function", // X
	"if", // X
	"in", // X
	"local",
	"nil",
	"not",
	"or",
	"repeat",
	"return", // X
	"then",
	"true", // X
	"until",
	"while", // X
]);

const LUAU_IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Returns true if the given string is a valid Luau identifier, and does not conflict with a temporary identifier */
export function isValidIdentifier(id: string) {
	return !LUAU_RESERVED_KEYWORDS.has(id) && LUAU_IDENTIFIER_REGEX.test(id);
}
