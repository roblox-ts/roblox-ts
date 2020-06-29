const LUAU_RESERVED_KEYWORDS = new Set([
	"and",
	"break",
	"do",
	"else",
	"elseif",
	"end",
	"false",
	"for",
	"function",
	"if",
	"in",
	"local",
	"nil",
	"not",
	"or",
	"repeat",
	"return",
	"then",
	"true",
	"until",
	"while",
]);

const LUAU_IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Returns true if the given string is a valid Luau identifier */
export function isValidLuauIdentifier(id: string) {
	return LUAU_IDENTIFIER_REGEX.test(id) && !LUAU_RESERVED_KEYWORDS.has(id);
}
