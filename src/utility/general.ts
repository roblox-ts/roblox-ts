import { SpawnOptions } from "child_process";
import spawn from "cross-spawn";
import path from "path";
import * as ts from "ts-morph";
import { isValidLuaIdentifier } from "../compiler";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";

export function safeLuaIndex(parent: string, child: string) {
	if (isValidLuaIdentifier(child)) {
		return `${parent ? parent.trimRight() + "." : ""}${child}`;
	} else {
		return `${parent.trimRight()}["${child}"]`;
	}
}

export function joinIndentedLines(lines: Array<string>, numTabs: number = 0) {
	if (lines.length > 0) {
		if (numTabs > 0) {
			const sep = "\t".repeat(numTabs);
			return lines.join("").replace(/(\\\r?\n|.)+/g, a => sep + a);
		} else {
			return lines.join("");
		}
	} else {
		return "";
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
		throw new CompilerError(`Unexpected extension type: ${ext}`, file, CompilerErrorType.UnexpectedExtensionType);
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

/** Skips over Null/Parenthesis/As expressions.
 * Be aware that this can change the type of your expression.
 */
export function skipNodesDownwards<T extends ts.Node>(exp: T, dontSkipParenthesis?: boolean): T;
export function skipNodesDownwards<T extends ts.Node>(exp?: T, dontSkipParenthesis?: boolean): T | undefined;
export function skipNodesDownwards<T extends ts.Node>(exp?: T, dontSkipParenthesis?: boolean) {
	if (exp) {
		while (
			(!dontSkipParenthesis && ts.TypeGuards.isParenthesizedExpression(exp)) ||
			ts.TypeGuards.isNonNullExpression(exp) ||
			ts.TypeGuards.isAsExpression(exp)
		) {
			exp = (exp.getExpression() as unknown) as T;
		}
		return exp;
	}
}

/** Skips over Null/Parenthesis/As expressions.
 * Be aware that this can change the type of your expression.
 */
export function skipNodesUpwards<T extends ts.Node>(exp: T, dontSkipParenthesis?: boolean): T;
export function skipNodesUpwards<T extends ts.Node>(exp?: T, dontSkipParenthesis?: boolean): T | undefined;
export function skipNodesUpwards<T extends ts.Node>(exp?: T, dontSkipParenthesis?: boolean) {
	if (exp) {
		while (
			exp &&
			((!dontSkipParenthesis && ts.TypeGuards.isParenthesizedExpression(exp)) ||
				ts.TypeGuards.isNonNullExpression(exp) ||
				ts.TypeGuards.isAsExpression(exp))
		) {
			exp = (exp.getParent() as unknown) as T;
		}
		return exp;
	}
}

/** Looks upwards, and gets the Parent nodes as long as the one above is a Null/Parenthesis/As expression.
 * Be aware that this can change the type of your expression.
 */
export function skipNodesUpwardsLookAhead(node: ts.Node) {
	let parent = node.getParent();

	while (
		parent &&
		(ts.TypeGuards.isNonNullExpression(parent) ||
			ts.TypeGuards.isParenthesizedExpression(parent) ||
			ts.TypeGuards.isAsExpression(parent))
	) {
		node = parent;
		parent = node.getParent();
	}

	return node;
}

export function makeSetStatement(state: CompilerState, varToSet: string, value: string) {
	value = removeBalancedParenthesisFromStringBorders(value);
	if (varToSet === "return") {
		return state.indent + `return ${value};\n`;
	} else {
		return state.indent + `${varToSet} = ${value};\n`;
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

export function stripExts(filePath: string) {
	const ext = path.extname(filePath);
	filePath = filePath.slice(0, -ext.length);
	const subext = path.extname(filePath);
	if (subext.length > 0) {
		filePath = filePath.slice(0, -subext.length);
	}
	return filePath;
}

export function isPathAncestorOf(ancestor: string, descendant: string) {
	if (ancestor === descendant) {
		return true;
	} else {
		const relative = path.relative(ancestor, descendant);
		return !relative.startsWith("..") && !path.isAbsolute(relative);
	}
}

export function arrayStartsWith<T>(a: Array<T>, b: Array<T>) {
	const minLength = Math.min(a.length, b.length);
	for (let i = 0; i < minLength; i++) {
		if (a[i] !== b[i]) {
			return false;
		}
	}
	return true;
}

export async function cmd(process: string, args: Array<string>, options?: SpawnOptions) {
	return new Promise<string>((resolve, reject) => {
		let output = "";
		spawn(process, args, options)
			.on("message", msg => (output += msg))
			.on("error", e => reject(e.message))
			.on("close", () => resolve(output));
	});
}
