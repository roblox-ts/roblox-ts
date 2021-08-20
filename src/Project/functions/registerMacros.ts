import ts from "byots";
import luau from "LuauAST";
import path from "path";
import { walkPackageJsons } from "Project/util/walkPackageJsons";
import { ProjectError } from "Shared/errors/ProjectError";
import { assert } from "Shared/util/assert";
import { realPathExistsSync } from "Shared/util/realPathExistsSync";
import { MacroManager } from "TSTransformer";
import { MacroTransformer } from "TSTransformer/macros/types";

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
		return symbol;
	}
	bail(pkgName, `failed to find symbol for ${name} in types file ${node.fileName}`);
}

export function registerMacros(
	typeRoots: Array<string>,
	program: ts.Program,
	macroManager: MacroManager,
	typeChecker: ts.TypeChecker,
) {
	walkPackageJsons(typeRoots, (pkgJson, pkgPath) => {
		if (pkgJson.macros) {
			const macroFile = path.resolve(pkgPath, pkgJson.macros);
			const typesPath = realPathExistsSync(
				path.resolve(pkgPath, pkgJson.types ?? pkgJson.typings ?? "index.d.ts"),
			);
			const typesFile = typesPath && program.getSourceFile(typesPath);
			if (typesFile && realPathExistsSync(macroFile)) {
				// eslint-disable-next-line
				const init = require(macroFile) as MacroTransformer;
				assert(typeof init === "function");
				const macros = init(luau, ts);
				for (const [name, macro] of Object.entries(macros.identifier ?? {})) {
					const symbol = getFileSymbolByNameOrThrow(
						typeChecker,
						name,
						typesFile,
						ts.SymbolFlags.Variable,
						pkgJson.name,
					);
					macroManager.addIdentifierMacro(symbol, macro);
				}
				for (const [name, macro] of Object.entries(macros.call ?? {})) {
					const symbol = getFileSymbolByNameOrThrow(
						typeChecker,
						name,
						typesFile,
						ts.SymbolFlags.Function,
						pkgJson.name,
					);
					macroManager.addCallMacro(symbol, macro);
				}
				for (const [name, macro] of Object.entries(macros.construct ?? {})) {
					const symbol = getFileSymbolByNameOrThrow(
						typeChecker,
						name,
						typesFile,
						ts.SymbolFlags.Interface,
						pkgJson.name,
					);
					macroManager.addConstructorMacro(symbol, macro);
				}
				for (const [name, methods] of Object.entries(macros.property ?? {})) {
					const symbol = getFileSymbolByNameOrThrow(
						typeChecker,
						name,
						typesFile,
						ts.SymbolFlags.Interface,
						pkgJson.name,
					);
					macroManager.addMacroClassMethods(symbol, methods);
				}
			} else {
				bail(
					pkgJson.name,
					`failed to find macro register file macroFile=${macroFile} typesPath=${typesPath} typesFile=${typesFile} realPathExists=${realPathExistsSync(
						macroFile,
					)}`,
				);
			}
		}
	});
}
