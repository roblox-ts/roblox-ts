const LUA_RESERVED_KEYWORDS = new Set([
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

const LUA_IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Returns true if the given string is a valid Lua identifier */
export function isValidLuaIdentifier(id: string) {
	return LUA_IDENTIFIER_REGEX.test(id) && !LUA_RESERVED_KEYWORDS.has(id);
}
