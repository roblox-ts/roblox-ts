import fs from "fs-extra";
import luau from "LuauAST";
import path from "path";
import { PackageJson, walkPackageJsons } from "Project/util/walkPackageJsons";
import { DTS_EXT } from "Shared/constants";
import { ProjectError } from "Shared/errors/ProjectError";
import { assert } from "Shared/util/assert";
import { realPathExistsSync } from "Shared/util/realPathExistsSync";
import { MacroManager } from "TSTransformer";
import * as TSTransformer from "TSTransformer/bundle";
import { MacroList, MacroTransformer } from "TSTransformer/macros/types";
import ts from "typescript";

function bail(pkgName: string, extra: string): never {
	debugger;
	throw new ProjectError(
		`registerMacros failed to initialise!\nReport this issue to the author of ${pkgName}!\nExtra info: ${extra}`,
	);
}

function getFileSymbolByNameOrThrow(
	typeChecker: ts.TypeChecker,
	name: string,
	node: ts.SourceFile,
	meaning: ts.SymbolFlags,
	pkgName: string,
) {
	const symbol = typeChecker.resolveName(name, node, meaning, false);
	if (symbol) {
		return ts.skipAlias(symbol, typeChecker);
	}
	bail(pkgName, `failed to find symbol for ${name} in types file ${node.fileName}`);
}

function addMacros<T>(
	macros: MacroList<T>,
	typeChecker: ts.TypeChecker,
	typesFile: ts.SourceFile,
	symbolFlags: ts.SymbolFlags,
	pkgName: string,
	callback: (symbol: ts.Symbol, macro: T) => void,
) {
	for (const [name, macro] of Object.entries(macros)) {
		const symbol = getFileSymbolByNameOrThrow(typeChecker, name, typesFile, symbolFlags, pkgName);
		callback(symbol, macro);
	}
}

export function registerMacros(
	typeRoots: Array<string>,
	program: ts.Program,
	macroManager: MacroManager,
	typeChecker: ts.TypeChecker,
	projectPath: string,
) {
	function handle(macroFile: string, typesPath: string, pkgName: string) {
		const typesFile = program.getSourceFile(typesPath);
		if (typesFile) {
			// eslint-disable-next-line
			const init = require(macroFile) as MacroTransformer;
			assert(typeof init === "function");
			const macros = init({ luau, ts, TSTransformer });
			addMacros(
				macros.identifier ?? {},
				typeChecker,
				typesFile,
				ts.SymbolFlags.Variable,
				pkgName,
				(symbol, macro) => macroManager.addIdentifierMacro(symbol, macro),
			);
			addMacros(macros.call ?? {}, typeChecker, typesFile, ts.SymbolFlags.Function, pkgName, (symbol, macro) =>
				macroManager.addCallMacro(symbol, macro),
			);
			addMacros(macros.construct ?? {}, typeChecker, typesFile, ts.SymbolFlags.Class, pkgName, (symbol, macro) =>
				macroManager.addConstructorMacro(symbol, macro),
			);
			addMacros(macros.property ?? {}, typeChecker, typesFile, ts.SymbolFlags.Class, pkgName, (symbol, methods) =>
				macroManager.addMacroClassMethods(symbol, methods),
			);
		} else {
			bail(
				pkgName,
				`failed to find macro register file macroFile=${macroFile} typesPath=${typesPath} typesFile=${typesFile} realPathExists=${realPathExistsSync(
					macroFile,
				)}`,
			);
		}
	}
	walkPackageJsons(typeRoots, (pkgJson, pkgPath) => {
		if (pkgJson.macros) {
			const macroFile = path.resolve(pkgPath, pkgJson.macros);
			const typesPath = realPathExistsSync(
				path.resolve(pkgPath, pkgJson.types ?? pkgJson.typings ?? "index.d.ts"),
			);
			if (!typesPath) bail(pkgJson.name, `Expected macro package to have types file: ${typesPath}`);
			handle(macroFile, typesPath, pkgJson.name);
		}
	});
	const projectPackage = fs.readJsonSync(path.join(projectPath, "package.json")) as PackageJson;
	if (projectPackage.macros) {
		const macroFile = path.resolve(projectPath, projectPackage.macros);
		const typesPath = path.resolve(
			projectPath,
			path.dirname(projectPackage.macros),
			path.join(path.basename(projectPackage.macros), DTS_EXT),
		);
		if (!typesPath) bail(projectPackage.name, `Expected project macros to have types file: ${typesPath}`);
		handle(macroFile, typesPath, projectPackage.name);
	}
}
