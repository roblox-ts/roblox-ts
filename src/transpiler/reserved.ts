import * as ts from "ts-morph";
import { TranspilerError, TranspilerErrorType } from "../class/errors/TranspilerError";

const LUA_RESERVED_KEYWORDS = [
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
];

const LUA_RESERVED_METAMETHODS = [
	"__index",
	"__newindex",
	"__add",
	"__sub",
	"__mul",
	"__div",
	"__mod",
	"__pow",
	"__unm",
	"__eq",
	"__lt",
	"__le",
	"__call",
	"__concat",
	"__tostring",
	"__len",
	"__metatable",
	"__mode",
];

export function checkReserved(name: string, node: ts.Node) {
	if (LUA_RESERVED_KEYWORDS.indexOf(name) !== -1) {
		throw new TranspilerError(
			`Cannot use '${name}' as identifier (reserved Lua keyword)`,
			node,
			TranspilerErrorType.ReservedKeyword,
		);
	} else if (!name.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
		throw new TranspilerError(
			`Cannot use '${name}' as identifier (doesn't match Lua's identifier rules)`,
			node,
			TranspilerErrorType.InvalidIdentifier,
		);
	} else if (name === "_exports" || name === "undefined" || name.match(/^_[0-9]+$/)) {
		throw new TranspilerError(
			`Cannot use '${name}' as identifier (reserved for Roblox-ts)`,
			node,
			TranspilerErrorType.RobloxTSReservedIdentifier,
		);
	}
}

export function checkMethodReserved(name: string, node: ts.Node) {
	checkReserved(name, node);
	if (LUA_RESERVED_METAMETHODS.indexOf(name) !== -1) {
		throw new TranspilerError(
			`Cannot use '${name}' as a method name (reserved Lua metamethod)`,
			node,
			TranspilerErrorType.ReservedMethodName,
		);
	}
}
