import * as ts from "ts-morph";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { CompilerState } from "../CompilerState";
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

const LUA_RESERVED_NAMESPACES = [
	"ipairs",
	"os",
	"type",
	"select",
	"math",
	"_G",
	"string",
	"require",
	"debug",
	"tonumber",
	"next",
	"_VERSION",
	"pairs",
	"pcall",
	"rawset",
	"error",
	"utf8",
	"setmetatable",
	"setfenv",
	"xpcall",
	"ypcall",
	"tostring",
	"print",
	"collectgarbage",
	"rawequal",
	"assert",
	"table",
	"coroutine",
	"rawget",
	"getmetatable",
	"getfenv",
	"tick",
	"wait",
	"delay",
	"spawn",
	"warn",
	"newproxy",

	"Random",
	"Axes",
	"BrickColor",
	"CFrame",
	"Color3",
	"ColorSequence",
	"ColorSequenceKeypoint",
	"Faces",
	"NumberRange",
	"NumberSequence",
	"NumberSequenceKeypoint",
	"Rect",
	"Region3",
	"Region3int16",
	"string",
	"UDim",
	"UDim2",
	"Vector2",
	"Vector3",
	"Ray",
];

export function checkReserved(name: string, node: ts.Node, checkNamespace: boolean = false) {
	if (LUA_RESERVED_KEYWORDS.indexOf(name) !== -1) {
		throw new CompilerError(
			`Cannot use '${name}' as identifier (reserved Lua keyword)`,
			node,
			CompilerErrorType.ReservedKeyword,
		);
	} else if (!name.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
		throw new CompilerError(
			`Cannot use '${name}' as identifier (doesn't match Lua's identifier rules)`,
			node,
			CompilerErrorType.InvalidIdentifier,
		);
	} else if (name === "_exports" || name === "undefined" || name.match(/^_[0-9]+$/)) {
		throw new CompilerError(
			`Cannot use '${name}' as identifier (reserved for Roblox-ts)`,
			node,
			CompilerErrorType.RobloxTSReservedIdentifier,
		);
	} else if (checkNamespace && LUA_RESERVED_NAMESPACES.indexOf(name) !== -1) {
		throw new CompilerError(
			`Cannot use '${name}' as identifier (reserved Lua namespace)`,
			node,
			CompilerErrorType.ReservedNamespace,
		);
	}
}

export function checkMethodReserved(name: string, node: ts.Node) {
	checkReserved(name, node);
	if (LUA_RESERVED_METAMETHODS.indexOf(name) !== -1) {
		throw new CompilerError(
			`Cannot use '${name}' as a method name (reserved Lua metamethod)`,
			node,
			CompilerErrorType.ReservedMethodName,
		);
	}
}

const COMPILER_DIRECTIVE_TAG = "rbxts";

export const enum CompilerDirective {
	Client = "client",
	Server = "server",
	Array = "array",
}

function getCompilerDirectiveFromDeclaration(
	node: ts.Node,
	directives: Array<CompilerDirective>,
): CompilerDirective | undefined {
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
	}
	const parent = node.getParent();
	if (parent) {
		const result = getCompilerDirectiveFromDeclaration(parent, directives);
		if (result !== undefined) {
			return result;
		}
	}
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
	symbol: ts.Symbol,
	directives: Array<CompilerDirective>,
): CompilerDirective | undefined {
	for (const node of symbol.getDeclarations()) {
		const result = getCompilerDirectiveFromDeclaration(node, directives);
		if (result !== undefined) {
			return result;
		}
	}
}

export function checkApiAccess(state: CompilerState, node: ts.Node) {
	const symbol = node.getSymbol();
	if (!symbol) {
		return;
	}
	if (state.scriptContext === ScriptContext.Server) {
		if (
			getCompilerDirective(symbol, [CompilerDirective.Client, CompilerDirective.Server]) ===
			CompilerDirective.Client
		) {
			throw new CompilerError(
				"Server script attempted to access a client-only API!",
				node,
				CompilerErrorType.InvalidClientOnlyAPIAccess,
			);
		}
	} else if (state.scriptContext === ScriptContext.Client) {
		if (
			getCompilerDirective(symbol, [CompilerDirective.Client, CompilerDirective.Server]) ===
			CompilerDirective.Server
		) {
			throw new CompilerError(
				"Client script attempted to access a server-only API!",
				node,
				CompilerErrorType.InvalidServerOnlyAPIAccess,
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
			throw new CompilerError(
				`${yellow(node.getText())} in ${yellow(parent.getText())} is of type ${bold(
					"any",
				)} which is not supported! Use type ${bold("unknown")} instead.`,
				node,
				CompilerErrorType.NoAny,
			);
		} else {
			throw new CompilerError(
				`${yellow(node.getText())} is of type ${bold("any")} which is not supported! Use type ${bold(
					"unknown",
				)} instead.`,
				node,
				CompilerErrorType.NoAny,
			);
		}
	}
}

export function checkReturnsNonAny(node: HasParameters) {
	const isInCatch = node.getFirstAncestorByKind(ts.SyntaxKind.CatchClause) !== undefined;
	if (!isInCatch && isAnyType(node.getReturnType())) {
		throw new CompilerError(
			`Functions with a return type of type ${bold("any")} are unsupported! Use type ${bold("unknown")} instead!`,
			node,
			CompilerErrorType.NoAny,
		);
	}
}
