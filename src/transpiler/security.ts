import * as ts from "ts-morph";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
import { HasParameters } from "../types";
import { isAnyType } from "../typeUtilities";
import { bold, ScriptContext, yellow } from "../utility";

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

const COMPILER_DIRECTIVE_TAG = "rbxts";

export const enum CompilerDirectives {
	Client = "client",
	Server = "server",
	Array = "array",
}

/**
 * Searches `node` recursively for directives. Returns either the first directive from the given list that it finds.
 * If it cannot find a directive from the list, it returns `undefined`.
 * Search is:
 *  - left -> right
 *  - inner -> outer
 * @param node JSDocable node to search
 * @param directives list of directives to search for
 */
export function getCompilerDirective(
	node: ts.Node,
	directives: Array<CompilerDirectives>,
): CompilerDirectives | undefined {
	if (ts.TypeGuards.isJSDocableNode(node)) {
		for (const jsDoc of node.getJsDocs()) {
			for (const jsTag of jsDoc.getTags()) {
				if (jsTag.getTagName() === COMPILER_DIRECTIVE_TAG) {
					const comment = jsTag.getComment();
					if (comment) {
						for (const word of comment.split(" ")) {
							for (const directive of directives) {
								if (word === directive) {
									return directive;
								}
							}
						}
					}
				}
			}
		}
		const parent = node.getParent();
		if (parent) {
			const result = getCompilerDirective(parent, directives);
			if (result !== undefined) {
				return result;
			}
		}
	}
}

export function checkApiAccess(state: TranspilerState, node: ts.Node) {
	if (state.scriptContext === ScriptContext.Server) {
		if (
			getCompilerDirective(node, [CompilerDirectives.Client, CompilerDirectives.Server]) ===
			CompilerDirectives.Client
		) {
			throw new TranspilerError(
				"Server script attempted to access a client-only API!",
				node,
				TranspilerErrorType.InvalidClientOnlyAPIAccess,
			);
		}
	} else if (state.scriptContext === ScriptContext.Client) {
		if (
			getCompilerDirective(node, [CompilerDirectives.Client, CompilerDirectives.Server]) ===
			CompilerDirectives.Server
		) {
			throw new TranspilerError(
				"Client script attempted to access a server-only API!",
				node,
				TranspilerErrorType.InvalidServerOnlyAPIAccess,
			);
		}
	}
}

export function checkNonAny(node: ts.Node, checkArrayType = false) {
	const isInCatch = node.getFirstAncestorByKind(ts.SyntaxKind.CatchClause) !== undefined;
	let type = node.getType();
	if (type.isArray() && checkArrayType) {
		const arrayType = type.getArrayType();
		if (arrayType) {
			type = arrayType;
		}
	}
	if (!isInCatch && isAnyType(type)) {
		const parent = node.getParent();
		if (parent) {
			throw new TranspilerError(
				`${yellow(node.getText())} in ${yellow(parent.getText())} is of type ${bold(
					"any",
				)} which is not supported! Use type ${bold("unknown")} instead.`,
				node,
				TranspilerErrorType.NoAny,
			);
		} else {
			throw new TranspilerError(
				`${yellow(node.getText())} is of type ${bold("any")} which is not supported! Use type ${bold(
					"unknown",
				)} instead.`,
				node,
				TranspilerErrorType.NoAny,
			);
		}
	}
}

export function checkReturnsNonAny(node: HasParameters) {
	const isInCatch = node.getFirstAncestorByKind(ts.SyntaxKind.CatchClause) !== undefined;
	if (!isInCatch && isAnyType(node.getReturnType())) {
		throw new TranspilerError(
			`Functions with a return type of type ${bold("any")} are unsupported! Use type ${bold("unknown")} instead!`,
			node,
			TranspilerErrorType.NoAny,
		);
	}
}
