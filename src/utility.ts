import path from "path";
import * as ts from "ts-morph";
import { isValidLuaIdentifier } from "./compiler";
import { ProjectError, ProjectErrorType } from "./errors/ProjectError";

export function safeLuaIndex(parent: string, child: string) {
	if (isValidLuaIdentifier(child)) {
		return `${parent ? parent + "." : ""}${child}`;
	} else {
		return `${parent}["${child}"]`;
	}
}

export function joinIndentedLines(lines: Array<string>, numTabs: number = 0) {
	if (lines.length > 0) {
		if (numTabs > 0) {
			const sep = "\t".repeat(numTabs);
			return lines.join("").replace(/.+/g, a => sep + a);
		} else {
			return lines.join("");
		}
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

/** Skips over Null/Parenthesis expressions.
 * Be aware that this can change the type of your expression to be potentially undefined.
 */
export function skipNodesDownwards<T extends ts.Node>(exp: T, dontSkipParenthesis?: boolean): T;
export function skipNodesDownwards<T extends ts.Node>(exp?: T, dontSkipParenthesis?: boolean): T | undefined;
export function skipNodesDownwards<T extends ts.Node>(exp?: T, dontSkipParenthesis?: boolean) {
	if (exp) {
		while (
			(!dontSkipParenthesis && ts.TypeGuards.isParenthesizedExpression(exp)) ||
			ts.TypeGuards.isNonNullExpression(exp)
		) {
			exp = (exp.getExpression() as unknown) as T;
		}
		return exp;
	}
}

/** Skips over Null/Parenthesis expressions.
 * Be aware that this can change the type of your expression to be potentially undefined.
 */
export function skipNodesUpwards<T extends ts.Node>(exp: T, dontSkipParenthesis?: boolean): T;
export function skipNodesUpwards<T extends ts.Node>(exp?: T, dontSkipParenthesis?: boolean): T | undefined;
export function skipNodesUpwards<T extends ts.Node>(exp?: T, dontSkipParenthesis?: boolean) {
	if (exp) {
		while (
			(!dontSkipParenthesis && ts.TypeGuards.isParenthesizedExpression(exp)) ||
			ts.TypeGuards.isNonNullExpression(exp)
		) {
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

export function transformPathToLua(rootPath: string, outPath: string, filePath: string) {
	const relativeToRoot = path.dirname(path.relative(rootPath, filePath));
	let name = path.basename(filePath, path.extname(filePath));
	const exts = new Array<string>();
	while (true) {
		const ext = path.extname(name);
		if (ext.length > 0) {
			exts.unshift(ext);
			name = path.basename(name, ext);
		} else {
			break;
		}
	}
	if (exts[exts.length - 1] === ".d") {
		exts.pop();
	}
	if (name === "index") {
		name = "init";
	}
	const luaName = name + exts.join("") + ".lua";
	return path.join(outPath, relativeToRoot, luaName);
}
