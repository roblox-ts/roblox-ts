import fs from "fs-extra";
import luau from "LuauAST";
import path from "path";
import { PackageJson, walkPackageJsons } from "Project/util/walkPackageJsons";
import { ProjectError } from "Shared/errors/ProjectError";
import { assert } from "Shared/util/assert";
import { MacroManager } from "TSTransformer";
import * as TSTransformer from "TSTransformer/bundle";
import { CallMacro, ConstructorMacro, IdentifierMacro, MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import ts from "typescript";

export type RegisterMacrosList = {
	identifier?: MacroList<IdentifierMacro>;
	construct?: MacroList<ConstructorMacro>;
	call?: MacroList<CallMacro>;
	property?: Record<string, MacroList<PropertyCallMacro>>;
};
export type TransformerBundle = (dependencies: {
	luau: typeof luau;
	ts: typeof ts;
	TSTransformer: typeof TSTransformer;
	services: {
		program: ts.Program;
		macroManager: MacroManager;
		typeChecker: ts.TypeChecker;
	};
	helpers: {
		registerMacros(file: string | ts.SourceFile, macros: RegisterMacrosList): void;
	};
}) => void;

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
	function handle(macroFile: string, pkgName: string) {
		// eslint-disable-next-line
		const init = require(macroFile) as TransformerBundle;
		assert(typeof init === "function");
		init({
			luau,
			ts,
			TSTransformer,
			services: {
				program,
				macroManager,
				typeChecker,
			},
			helpers: {
				registerMacros(file, macros) {
					const typesFile = typeof file === "string" ? program.getSourceFile(file) : file;
					if (!typesFile) bail(pkgName, "Received undefined file reference in registerMacros helper");
					addMacros(
						macros.identifier ?? {},
						typeChecker,
						typesFile,
						ts.SymbolFlags.Variable,
						pkgName,
						(symbol, macro) => macroManager.addIdentifierMacro(symbol, macro),
					);
					addMacros(
						macros.call ?? {},
						typeChecker,
						typesFile,
						ts.SymbolFlags.Function,
						pkgName,
						(symbol, macro) => macroManager.addCallMacro(symbol, macro),
					);
					addMacros(
						macros.construct ?? {},
						typeChecker,
						typesFile,
						ts.SymbolFlags.Class,
						pkgName,
						(symbol, macro) => macroManager.addConstructorMacro(symbol, macro),
					);
					addMacros(
						macros.property ?? {},
						typeChecker,
						typesFile,
						ts.SymbolFlags.Class,
						pkgName,
						(symbol, methods) => macroManager.addMacroClassMethods(symbol, methods),
					);
				},
			},
		});
	}

	function handlePackage(packageJson: PackageJson, packagePath: string) {
		if (typeof packageJson.macros === "string") {
			const macroFile = path.resolve(packagePath, packageJson.macros);
			handle(macroFile, packageJson.name);
		} else if (Array.isArray(packageJson.macros)) {
			for (const macro of packageJson.macros) {
				const macroFile = path.resolve(packagePath, macro);
				handle(macroFile, packageJson.name);
			}
		}
	}

	const projectPackage = fs.readJsonSync(path.join(projectPath, "package.json")) as PackageJson;
	handlePackage(projectPackage, projectPath);

	walkPackageJsons(typeRoots, handlePackage);
}
