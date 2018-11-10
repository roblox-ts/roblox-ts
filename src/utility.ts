import * as path from "path";
import * as ts from "ts-simple-ast";
import { CompilerError, CompilerErrorType } from "./class/errors/CompilerError";

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

export function stripExts(fileName: string): string {
	const ext = path.extname(fileName);
	if (ext.length > 0) {
		return stripExts(path.basename(fileName, ext));
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
		throw new CompilerError(`Unexpected extension type: ${ext}`, CompilerErrorType.UnexpectedExtensionType);
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
