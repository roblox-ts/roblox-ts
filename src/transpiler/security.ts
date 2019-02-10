import * as ts from "ts-morph";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
import { isAnyType } from "../typeUtilities";
import { ScriptContext } from "../utility";

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

function getJSDocs(node: ts.Node) {
	const symbol = node.getSymbol();
	if (symbol) {
		const valDec = symbol.getValueDeclaration();
		if (valDec) {
			if (ts.TypeGuards.isPropertySignature(valDec) || ts.TypeGuards.isMethodSignature(valDec)) {
				return valDec.getJsDocs();
			}
		}
	}
	return [];
}

function hasDirective(node: ts.Node, directive: string) {
	for (const jsDoc of getJSDocs(node)) {
		if (
			jsDoc
				.getText()
				.split(" ")
				.indexOf(directive) !== -1
		) {
			return true;
		}
	}
	return false;
}

export function checkApiAccess(state: TranspilerState, node: ts.Node) {
	if (state.scriptContext === ScriptContext.Server) {
		if (hasDirective(node, "@rbx-client")) {
			throw new TranspilerError(
				"Server script attempted to access a client-only API!",
				node,
				TranspilerErrorType.InvalidClientOnlyAPIAccess,
			);
		}
	} else if (state.scriptContext === ScriptContext.Client) {
		if (hasDirective(node, "@rbx-server")) {
			throw new TranspilerError(
				"Client script attempted to access a server-only API!",
				node,
				TranspilerErrorType.InvalidServerOnlyAPIAccess,
			);
		}
	}
}

export function checkNonAny(node: ts.Node) {
	const isInCatch = node.getFirstAncestorByKind(ts.SyntaxKind.CatchClause) !== undefined;
	if (!isInCatch && isAnyType(node.getType())) {
		throw new TranspilerError(
			"Variables of type `any` are not supported! Use `unknown` instead.",
			node,
			TranspilerErrorType.NoAny,
		);
	}
}
