import * as path from "path";
import * as ts from "ts-morph";
import { ProjectError, ProjectErrorType } from "./errors/ProjectError";

const luaIdentifierRegex = /^[A-Za-z_][A-Za-z0-9_]*$/;
export function isValidLuaIdentifier(id: string) {
	return luaIdentifierRegex.test(id);
}

export function safeLuaIndex(parent: string, child: string) {
	if (isValidLuaIdentifier(child)) {
		return `${parent}.${child}`;
	} else {
		return `${parent}["${child}"]`;
	}
}

export function removeBalancedParenthesisFromStringBorders(str: string) {
	let parenDepth = 0;
	let inOpenParens: number | undefined;
	let outCloseParens: number | undefined;

	for (const char of str) {
		if (char === ")") {
			if (outCloseParens === undefined) {
				outCloseParens = parenDepth;
			}

			parenDepth--;
		} else if (outCloseParens !== undefined) {
			outCloseParens = undefined;

			if (inOpenParens !== undefined) {
				if (parenDepth < inOpenParens) {
					inOpenParens = parenDepth;
				}
			}
		}

		if (char === "(") {
			parenDepth++;
		} else if (inOpenParens === undefined) {
			inOpenParens = parenDepth;
		}
	}
	const index = Math.min(inOpenParens || 0, outCloseParens || 0);
	return index === 0 ? str : str.slice(index, -index);
}

// console.log(`"${removeBalancedParenthesisFromStringBorders("")}"`);
// console.log(`"${removeBalancedParenthesisFromStringBorders("x")}"`);
// console.log(`"${removeBalancedParenthesisFromStringBorders("(x)")}"`);
// console.log(`"${removeBalancedParenthesisFromStringBorders("((x))")}"`);
// console.log(`"${removeBalancedParenthesisFromStringBorders("(x + 5)")}"`);
// console.log(`"${removeBalancedParenthesisFromStringBorders("(x) + 5")}"`);
// console.log(`"${removeBalancedParenthesisFromStringBorders("5 + (x)")}"`);
// console.log(`"${removeBalancedParenthesisFromStringBorders("((x) + 5)")}"`);
// console.log(`"${removeBalancedParenthesisFromStringBorders("(5 + (x))")}"`);
// console.log(`"${removeBalancedParenthesisFromStringBorders("()()")}"`);
// console.log(`"${removeBalancedParenthesisFromStringBorders("(()())")}"`);

export function joinIndentedLines(lines: Array<string>, numTabs: number = 0) {
	if (lines.length > 0) {
		const sep = "\t".repeat(numTabs);
		return sep + lines.join(sep);
	} else {
		return "";
	}
}

export function stripExtensions(fileName: string): string {
	const ext = path.extname(fileName);
	if (ext.length > 0) {
		return stripExtensions(path.basename(fileName, ext));
	} else {
		return fileName;
	}
}

const scriptContextCache = new Map<string, ScriptContext>();
export function clearContextCache() {
	scriptContextCache.clear();
}

export enum ScriptType {
	Server,
	Client,
	Module,
}

export function getScriptType(file: ts.SourceFile): ScriptType {
	const filePath = file.getFilePath();
	const ext = path.extname(filePath);
	if (ext !== ".ts" && ext !== ".tsx") {
		throw new ProjectError(`Unexpected extension type: ${ext}`, ProjectErrorType.UnexpectedExtensionType);
	}

	const subext = path.extname(path.basename(filePath, ext));
	if (subext === ".server") {
		return ScriptType.Server;
	} else if (subext === ".client") {
		return ScriptType.Client;
	} else {
		return ScriptType.Module;
	}
}

export enum ScriptContext {
	None,
	Client,
	Server,
	Both,
}

export function getScriptContext(file: ts.SourceFile, seen = new Set<string>()): ScriptContext {
	const filePath = file.getFilePath();
	if (scriptContextCache.has(filePath)) {
		return scriptContextCache.get(filePath)!;
	}

	// prevent infinite recursion
	if (seen.has(filePath)) {
		return ScriptContext.None;
	}
	seen.add(filePath);

	const scriptType = getScriptType(file);
	if (scriptType === ScriptType.Server) {
		return ScriptContext.Server;
	} else if (scriptType === ScriptType.Client) {
		return ScriptContext.Client;
	} else {
		let isServer = false;
		let isClient = false;

		for (const referencingFile of file.getReferencingSourceFiles()) {
			const referenceContext = getScriptContext(referencingFile, seen);
			if (referenceContext === ScriptContext.Server) {
				isServer = true;
			} else if (referenceContext === ScriptContext.Client) {
				isClient = true;
			} else if (referenceContext === ScriptContext.Both) {
				isServer = true;
				isClient = true;
			}
		}

		if (isServer && isClient) {
			return ScriptContext.Both;
		} else if (isServer) {
			return ScriptContext.Server;
		} else if (isClient) {
			return ScriptContext.Client;
		} else {
			return ScriptContext.None;
		}
	}
}

export function red(text: string) {
	return `\x1b[31m${text}\x1b[0m`;
}

export function yellow(text: string) {
	return `\x1b[33m${text}\x1b[0m`;
}

export function bold(text: string) {
	return `\x1b[1m${text}\x1b[0m`;
}

export function suggest(text: string) {
	return `...\t${yellow(text)}`;
}

export function isIdentifierWhoseDefinitionMatchesNode(
	node: ts.Node<ts.ts.Node>,
	potentialDefinition: ts.Identifier,
): node is ts.Identifier {
	if (ts.TypeGuards.isIdentifier(node)) {
		for (const def of node.getDefinitions()) {
			if (def.getNode() === potentialDefinition) {
				return true;
			}
		}
	}
	return false;
}

/** Skips over Null expressions */
export function getNonNullExpressionDownwards<T extends ts.Node>(exp: T): T;
export function getNonNullExpressionDownwards<T extends ts.Node>(exp?: T): T | undefined;
export function getNonNullExpressionDownwards<T extends ts.Node>(exp?: T) {
	if (exp) {
		while (ts.TypeGuards.isNonNullExpression(exp)) {
			exp = (exp.getExpression() as unknown) as T;
		}

		return exp;
	}
}

/** Skips over Null/Parenthesis expressions */
export function getNonNullUnParenthesizedExpressionDownwards<T extends ts.Node>(exp: T): T;
export function getNonNullUnParenthesizedExpressionDownwards<T extends ts.Node>(exp?: T): T | undefined;
export function getNonNullUnParenthesizedExpressionDownwards<T extends ts.Node>(exp?: T) {
	if (exp) {
		while (ts.TypeGuards.isParenthesizedExpression(exp) || ts.TypeGuards.isNonNullExpression(exp)) {
			exp = (exp.getExpression() as unknown) as T;
		}
		return exp;
	}
}

/** Skips over Null expressions */
export function getNonNullExpressionUpwards<T extends ts.Node>(exp: T): T;
export function getNonNullExpressionUpwards<T extends ts.Node>(exp?: T): T | undefined;
export function getNonNullExpressionUpwards<T extends ts.Node>(exp?: T) {
	if (exp) {
		while (ts.TypeGuards.isNonNullExpression(exp)) {
			exp = (exp.getParent() as unknown) as T;
		}

		return exp;
	}
}

/** Skips over Null/Parenthesis expressions */
export function getNonNullUnParenthesizedExpressionUpwards<T extends ts.Node>(exp: T): T;
export function getNonNullUnParenthesizedExpressionUpwards<T extends ts.Node>(exp?: T): T | undefined;
export function getNonNullUnParenthesizedExpressionUpwards<T extends ts.Node>(exp?: T) {
	if (exp) {
		while (ts.TypeGuards.isParenthesizedExpression(exp) || ts.TypeGuards.isNonNullExpression(exp)) {
			exp = (exp.getParent() as unknown) as T;
		}
		return exp;
	}
}

export function makeSetStatement(varToSet: string, value: string) {
	if (varToSet === "return") {
		return `return ${value}`;
	} else {
		return `${varToSet} = ${value}`;
	}
}
