import * as path from "path";
import * as ts from "ts-morph";
import * as util from "util";
import { checkReserved, transpileExpression } from ".";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
import {
	getScriptContext,
	getScriptType,
	isValidLuaIdentifier,
	ScriptContext,
	ScriptType,
	stripExts,
} from "../utility";

function isDefinitionALet(def: ts.DefinitionInfo<ts.ts.DefinitionInfo>) {
	const parent = def.getNode().getParent();
	if (parent && ts.TypeGuards.isVariableDeclaration(parent)) {
		const grandparent = parent.getParent();
		return (
			ts.TypeGuards.isVariableDeclarationList(grandparent) &&
			grandparent.getDeclarationKind() === ts.VariableDeclarationKind.Let
		);
	}
	return false;
}

function shouldLocalizeImport(namedImport: ts.Identifier) {
	for (const definition of namedImport.getDefinitions()) {
		if (isDefinitionALet(definition)) {
			return false;
		}
	}
	return true;
}

function getRobloxPathString(rbxPath: Array<string>) {
	rbxPath = rbxPath.map(v => (isValidLuaIdentifier(v) ? "." + v : `["${v}"]`));
	return "game" + rbxPath.join("");
}

function getRbxPath(state: TranspilerState, sourceFile: ts.SourceFile) {
	const partition = state.syncInfo.find(part => part.dir.isAncestorOf(sourceFile));
	if (partition) {
		const rbxPath = partition.dir
			.getRelativePathTo(sourceFile)
			.split("/")
			.filter(part => part !== ".");

		let last = rbxPath.pop()!;
		let ext = path.extname(last);
		while (ext !== "") {
			last = path.basename(last, ext);
			ext = path.extname(last);
		}
		rbxPath.push(last);

		return rbxPath;
	}
}

function validateImport(state: TranspilerState, sourceFile: ts.SourceFile, moduleFile: ts.SourceFile) {
	const sourceContext = getScriptContext(sourceFile);
	const sourceRbxPath = getRbxPath(state, sourceFile);
	const moduleRbxPath = getRbxPath(state, moduleFile);
	if (sourceRbxPath !== undefined && moduleRbxPath !== undefined) {
		if (getScriptType(moduleFile) !== ScriptType.Module) {
			throw new CompilerError(
				util.format("Attempted to import non-ModuleScript! %s", moduleFile.getFilePath()),
				CompilerErrorType.ImportNonModuleScript,
			);
		}

		if (sourceContext === ScriptContext.Client) {
			if (moduleRbxPath[0] === "ServerScriptService" || moduleRbxPath[0] === "ServerStorage") {
				throw new CompilerError(
					util.format(
						"%s is not allowed to import %s",
						getRobloxPathString(sourceRbxPath),
						getRobloxPathString(moduleRbxPath),
					),
					CompilerErrorType.InvalidImportAccess,
				);
			}
		}
	}
}

function getRelativeImportPath(
	state: TranspilerState,
	sourceFile: ts.SourceFile,
	moduleFile: ts.SourceFile | undefined,
	specifier: string,
) {
	if (moduleFile) {
		validateImport(state, sourceFile, moduleFile);
	}

	const currentPartition = state.syncInfo.find(part => part.dir.isAncestorOf(sourceFile));
	const modulePartition = moduleFile && state.syncInfo.find(part => part.dir.isAncestorOf(moduleFile));

	if (moduleFile && currentPartition && currentPartition.target !== (modulePartition && modulePartition.target)) {
		return getImportPathFromFile(state, sourceFile, moduleFile);
	}

	const parts = path.posix
		.normalize(specifier)
		.split("/")
		.filter(part => part !== ".")
		.map(part => (part === ".." ? ".Parent" : part));
	if (parts[parts.length - 1] === ".index") {
		parts.pop();
	}
	let prefix = "script";
	if (stripExts(sourceFile.getBaseName()) !== "index") {
		prefix += ".Parent";
	}

	const importRoot = prefix + parts.filter(p => p === ".Parent").join("");
	const importParts = parts.filter(p => p !== ".Parent");
	const params = importRoot + (importParts.length > 0 ? `, "${importParts.join(`", "`)}"` : "");

	state.usesTSLibrary = true;
	return `TS.import(${params})`;
}

const moduleCache = new Map<string, string>();

function getImportPathFromFile(state: TranspilerState, sourceFile: ts.SourceFile, moduleFile: ts.SourceFile) {
	validateImport(state, sourceFile, moduleFile);
	if (state.modulesDir && state.modulesDir.isAncestorOf(moduleFile)) {
		let parts = state.modulesDir
			.getRelativePathTo(moduleFile)
			.split("/")
			.filter(part => part !== ".");

		const moduleName = parts.shift();
		if (!moduleName) {
			throw new CompilerError("Compiler.getImportPath() failed! #1", CompilerErrorType.GetImportPathFail1);
		}

		let mainPath: string;
		if (moduleCache.has(moduleName)) {
			mainPath = moduleCache.get(moduleName)!;
		} else {
			const pkgJson = require(path.join(state.modulesDir.getPath(), moduleName, "package.json"));
			mainPath = pkgJson.main as string;
			moduleCache.set(moduleName, mainPath);
		}

		parts = mainPath.split(/[\\/]/g);
		let last = parts.pop();
		if (!last) {
			throw new CompilerError("Compiler.getImportPath() failed! #2", CompilerErrorType.GetImportPathFail2);
		}
		last = stripExts(last);
		if (last !== "init") {
			parts.push(last);
		}

		parts = parts
			.filter(part => part !== ".")
			.map(part => (isValidLuaIdentifier(part) ? "." + part : `["${part}"]`));

		state.usesTSLibrary = true;
		const params = `TS.getModule("${moduleName}", script.Parent)` + parts.join("");
		return `require(${params})`;
	} else {
		const partition = state.syncInfo.find(part => part.dir.isAncestorOf(moduleFile));
		if (!partition) {
			throw new CompilerError(
				"Could not compile non-relative import, no data from rojo.json",
				CompilerErrorType.NoRojoData,
			);
		}

		const parts = partition.dir
			.getRelativePathAsModuleSpecifierTo(moduleFile)
			.split("/")
			.filter(part => part !== ".");

		const last = parts.pop();
		if (!last) {
			throw new CompilerError("Compiler.getImportPath() failed! #3", CompilerErrorType.GetImportPathFail3);
		}

		if (last !== "index") {
			parts.push(last);
		}

		const params = partition.target
			.split(".")
			.concat(parts)
			.filter(v => v.length > 0)
			.map(v => `"${v}"`);

		// We could probably check this is a valid service at compile-time
		params[0] = "game:GetService(" + params[0] + ")";
		state.usesTSLibrary = true;
		return `TS.import(${params.join(", ")})`;
	}
}

export function transpileImportDeclaration(state: TranspilerState, node: ts.ImportDeclaration) {
	let luaPath: string;
	if (node.isModuleSpecifierRelative()) {
		luaPath = getRelativeImportPath(
			state,
			node.getSourceFile(),
			node.getModuleSpecifierSourceFile(),
			node.getModuleSpecifier().getLiteralText(),
		);
	} else {
		const moduleFile = node.getModuleSpecifierSourceFile();
		if (moduleFile) {
			luaPath = getImportPathFromFile(state, node.getSourceFile(), moduleFile);
		} else {
			const specifierText = node.getModuleSpecifier().getLiteralText();
			throw new TranspilerError(
				`Could not find file for '${specifierText}'. Did you forget to "npm install"?`,
				node,
				TranspilerErrorType.MissingModuleFile,
			);
		}
	}

	const lhs = new Array<string>();
	const rhs = new Array<string>();

	const defaultImport = node.getDefaultImport();
	if (defaultImport) {
		const definitions = defaultImport.getDefinitions();
		const exportAssignments =
			definitions.length > 0 &&
			definitions[0]
				.getNode()
				.getSourceFile()
				.getExportAssignments();

		const defaultImportExp = transpileExpression(state, defaultImport);

		if (exportAssignments && exportAssignments.length === 1 && exportAssignments[0].isExportEquals()) {
			// If the defaultImport is importing an `export = ` statement,
			return `local ${defaultImportExp} = ${luaPath};\n`;
		}

		lhs.push(defaultImportExp);
		rhs.push(`._default`);
	}

	const namespaceImport = node.getNamespaceImport();
	if (namespaceImport) {
		lhs.push(transpileExpression(state, namespaceImport));
		rhs.push("");
	}

	let result = "";
	let rhsPrefix: string;
	let hasVarNames = false;
	const unlocalizedImports = new Array<string>();

	node.getNamedImports().forEach(namedImport => {
		const aliasNode = namedImport.getAliasNode();
		const name = namedImport.getName();
		const alias = aliasNode ? aliasNode.getText() : name;
		const shouldLocalize = shouldLocalizeImport(namedImport.getNameNode());

		// keep these here no matter what, so that exports can take from intinial state.
		checkReserved(alias, node);
		lhs.push(alias);
		rhs.push(`.${name}`);

		if (shouldLocalize) {
			unlocalizedImports.push("");
		} else {
			hasVarNames = true;
			unlocalizedImports.push(alias);
		}
	});

	if (rhs.length === 1 && !hasVarNames) {
		rhsPrefix = luaPath;
	} else {
		if (hasVarNames || lhs.length > 0) {
			rhsPrefix = state.getNewId();
			result += `local ${rhsPrefix} = `;
		}
		result += `${luaPath};\n`;
	}

	unlocalizedImports
		.filter(alias => alias !== "")
		.forEach((alias, i) => state.variableAliases.set(alias, rhsPrefix + rhs[i]));

	if (hasVarNames || lhs.length > 0) {
		const lhsStr = lhs.join(", ");
		const rhsStr = rhs.map(v => rhsPrefix + v).join(", ");

		if (lhsStr === "Roact") {
			state.hasRoactImport = true;
		}
		result += `local ${lhsStr} = ${rhsStr};\n`;
	}

	return result;
}

export function transpileImportEqualsDeclaration(state: TranspilerState, node: ts.ImportEqualsDeclaration) {
	let luaPath: string;
	const moduleFile = node.getExternalModuleReferenceSourceFile();
	if (moduleFile) {
		if (node.isExternalModuleReferenceRelative()) {
			let specifier: string;
			const moduleReference = node.getModuleReference();
			if (ts.TypeGuards.isExternalModuleReference(moduleReference)) {
				const exp = moduleReference.getExpressionOrThrow() as ts.StringLiteral;
				specifier = exp.getLiteralText();
			} else {
				throw new TranspilerError("Bad specifier", node, TranspilerErrorType.BadSpecifier);
			}
			luaPath = getRelativeImportPath(state, node.getSourceFile(), moduleFile, specifier);
		} else {
			luaPath = getImportPathFromFile(state, node.getSourceFile(), moduleFile);
		}
	} else {
		const text = node.getModuleReference().getText();
		throw new TranspilerError(`Could not find file for '${text}'`, node, TranspilerErrorType.MissingModuleFile);
	}

	const name = node.getName();

	if (name === "Roact") {
		state.hasRoactImport = true;
	}

	return state.indent + `local ${name} = ${luaPath};\n`;
}

export function transpileExportDeclaration(state: TranspilerState, node: ts.ExportDeclaration) {
	let luaImportStr = "";
	const moduleSpecifier = node.getModuleSpecifier();
	if (moduleSpecifier) {
		if (node.isModuleSpecifierRelative()) {
			luaImportStr = getRelativeImportPath(
				state,
				node.getSourceFile(),
				node.getModuleSpecifierSourceFile(),
				moduleSpecifier.getLiteralText(),
			);
		} else {
			const moduleFile = node.getModuleSpecifierSourceFile();
			if (moduleFile) {
				luaImportStr = getImportPathFromFile(state, node.getSourceFile(), moduleFile);
			} else {
				const specifierText = moduleSpecifier.getLiteralText();
				throw new TranspilerError(
					`Could not find file for '${specifierText}'. Did you forget to "npm install"?`,
					node,
					TranspilerErrorType.MissingModuleFile,
				);
			}
		}
	}

	const ancestor =
		node.getFirstAncestorByKind(ts.SyntaxKind.ModuleDeclaration) ||
		node.getFirstAncestorByKind(ts.SyntaxKind.SourceFile);

	if (!ancestor) {
		throw new TranspilerError("Could not find export ancestor!", node, TranspilerErrorType.BadAncestor);
	}

	let ancestorName: string;
	if (ts.TypeGuards.isNamespaceDeclaration(ancestor)) {
		ancestorName = ancestor.getName();
	} else {
		state.isModule = true;
		ancestorName = "_exports";
	}

	const lhs = new Array<string>();
	const rhs = new Array<string>();

	if (node.isNamespaceExport()) {
		state.usesTSLibrary = true;
		return state.indent + `TS.exportNamespace(${luaImportStr}, ${ancestorName});\n`;
	} else {
		const namedExports = node.getNamedExports();
		if (namedExports.length === 0) {
			return "";
		}
		namedExports.forEach(namedExport => {
			const aliasNode = namedExport.getAliasNode();
			let name = namedExport.getNameNode().getText();
			if (name === "default") {
				name = "_default";
			}
			const alias = aliasNode ? aliasNode.getText() : name;
			checkReserved(alias, node);
			lhs.push(alias);
			if (luaImportStr !== "") {
				rhs.push(`.${name}`);
			} else {
				rhs.push(state.getAlias(name));
			}
		});

		let result = "";
		let rhsPrefix = "";
		const lhsPrefix = ancestorName + ".";
		if (luaImportStr !== "") {
			if (rhs.length <= 1) {
				rhsPrefix = `${luaImportStr}`;
			} else {
				rhsPrefix = state.getNewId();
				result += state.indent + `local ${rhsPrefix} = ${luaImportStr};\n`;
			}
		}
		const lhsStr = lhs.map(v => lhsPrefix + v).join(", ");
		const rhsStr = rhs.map(v => rhsPrefix + v).join(", ");
		result += `${lhsStr} = ${rhsStr};\n`;
		return result;
	}
}

export function transpileExportAssignment(state: TranspilerState, node: ts.ExportAssignment) {
	let result = state.indent;
	if (node.isExportEquals()) {
		state.isModule = true;
		const expStr = transpileExpression(state, node.getExpression());
		result += `_exports = ${expStr};\n`;
	} else {
		const symbol = node.getSymbol();
		if (symbol) {
			if (symbol.getName() === "default") {
				state.isModule = true;
				result += "_exports._default = " + transpileExpression(state, node.getExpression()) + ";\n";
			}
		}
	}
	return result;
}
