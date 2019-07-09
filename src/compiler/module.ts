import path from "path";
import * as ts from "ts-morph";
import { checkReserved, compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { ProjectType } from "../Project";
import { FileRelation, RojoProject } from "../RojoProject";
import { isRbxService, isUsedAsType } from "../typeUtilities";
import {
	isPathAncestorOf,
	safeLuaIndex,
	skipNodesDownwards,
	skipNodesUpwards,
	stripExtensions,
	transformPathToLua,
} from "../utility";

function isDefinitionALet(def: ts.DefinitionInfo<ts.ts.DefinitionInfo>) {
	const parent = skipNodesUpwards(def.getNode().getParent());
	if (parent && ts.TypeGuards.isVariableDeclaration(parent)) {
		const grandparent = skipNodesUpwards(parent.getParent());
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

function getRojoUnavailableError(node: ts.Node) {
	return new CompilerError(
		`Failed to load Rojo configuration! Cannot compile ${node.getKindName()}`,
		node,
		CompilerErrorType.BadRojo,
	);
}

function getRelativeImportPath(state: CompilerState, sourceFile: ts.SourceFile, moduleFile: ts.SourceFile) {
	let sourcePath = path.normalize(sourceFile.getFilePath());
	let modulePath = path.normalize(moduleFile.getFilePath());

	const sourceBaseName = stripExtensions(sourceFile.getBaseName());
	const sourceInit = sourceBaseName === "index" || sourceBaseName === "init";
	if (sourceInit) {
		sourcePath = path.resolve(sourcePath, "..");
	}

	const moduleBaseName = stripExtensions(moduleFile.getBaseName());
	const moduleInit = moduleBaseName === "index" || moduleBaseName === "init";
	if (moduleInit) {
		modulePath = path.resolve(modulePath, "..");
	}

	const relative = path.relative(sourcePath, modulePath).split(path.sep);

	let start = "script";

	while (relative[0] === "..") {
		relative.shift();
		start += ".Parent";
	}

	if (!moduleInit) {
		relative[relative.length - 1] = stripExtensions(relative[relative.length - 1]);
	}

	return `TS.import(${start}, ${relative.map(v => `"${v}"`).join(", ")})`;
}

function getRelativeImportPathRojo(
	state: CompilerState,
	sourceFile: ts.SourceFile,
	moduleFile: ts.SourceFile,
	node: ts.Node,
) {
	const rbxFrom = state.rojoProject!.getRbxFromFile(
		transformPathToLua(state.rootPath, state.outPath, sourceFile.getFilePath()),
	).path;
	const rbxTo = state.rojoProject!.getRbxFromFile(
		transformPathToLua(state.rootPath, state.outPath, moduleFile.getFilePath()),
	).path;

	if (!rbxFrom) {
		throw getRojoUnavailableError(node);
	}

	if (!rbxTo) {
		throw getRojoUnavailableError(node);
	}

	const relative = RojoProject.relative(rbxFrom, rbxTo);

	let start = "script";
	while (relative[0] === "..") {
		relative.shift();
		start += ".Parent";
	}

	return `TS.import(${start}, ${relative.map(v => `"${v}"`).join(", ")})`;
}

const moduleCache = new Map<string, string>();

function getModuleImportPath(state: CompilerState, moduleFile: ts.SourceFile) {
	let parts = path
		.relative(state.modulesPath, moduleFile.getFilePath())
		.split(path.sep)
		.filter(part => part !== ".");

	const scope = parts.shift()!;
	if (scope !== "@rbxts") {
		throw new CompilerError(
			"Imported packages must have the @rbxts scope!",
			moduleFile,
			CompilerErrorType.BadPackageScope,
		);
	}

	const moduleName = parts.shift()!;

	let mainPath: string;
	if (moduleCache.has(moduleName)) {
		mainPath = moduleCache.get(moduleName)!;
	} else {
		const pkgJson = require(path.join(state.modulesPath, scope, moduleName, "package.json"));
		mainPath = pkgJson.main as string;
		moduleCache.set(moduleName, mainPath);
	}

	parts = mainPath.split(/[\\/]/g);
	const last = stripExtensions(parts.pop()!);
	if (last !== "init") {
		parts.push(last);
	}

	parts = parts.filter(part => part !== ".").map(part => safeLuaIndex(" ", part));
	state.usesTSLibrary = true;
	const params = `TS.getModule("${moduleName}")` + parts.join("");
	return `TS.import(${params})`;
}

function getAbsoluteImportPathRojo(state: CompilerState, moduleFile: ts.SourceFile, node: ts.Node) {
	if (!state.rojoProject) {
		throw getRojoUnavailableError(node);
	}

	const filePath = moduleFile.getFilePath();
	const rbx = state.rojoProject.getRbxFromFile(transformPathToLua(state.rootPath, state.outPath, filePath));
	if (!rbx.path || rbx.path.length === 0) {
		throw new CompilerError(`Could not find Rojo data for ${filePath}`, node, CompilerErrorType.BadRojo);
	}

	const rbxPath = [...rbx.path];

	let service = rbxPath.shift()!;
	if (isRbxService(service)) {
		service = `game:GetService("${service}")`;
	} else {
		throw new CompilerError(`"${service}" is not a valid Roblox Service!`, node, CompilerErrorType.InvalidService);
	}

	return `TS.import(${service}, ${rbxPath.map(v => `"${v}"`).join(", ")})`;
}

function getImportPath(
	state: CompilerState,
	sourceFile: ts.SourceFile,
	moduleFile: ts.SourceFile,
	node: ts.Node,
): string {
	if (isPathAncestorOf(state.modulesPath, moduleFile.getFilePath())) {
		return getModuleImportPath(state, moduleFile);
	}

	if (state.projectType === ProjectType.Game) {
		const fileRelation = state.rojoProject!.getFileRelation(
			transformPathToLua(state.rootPath, state.outPath, sourceFile.getFilePath()),
			transformPathToLua(state.rootPath, state.outPath, moduleFile.getFilePath()),
		);
		if (fileRelation === FileRelation.OutToOut) {
			return getAbsoluteImportPathRojo(state, moduleFile, node);
		} else if (fileRelation === FileRelation.OutToIn) {
			throw new CompilerError(
				"Attempted to import a file inside of an isolated container from outside!",
				node,
				CompilerErrorType.IsolatedContainer,
			);
		} else if (fileRelation === FileRelation.InToOut) {
			return getAbsoluteImportPathRojo(state, moduleFile, node);
		} else {
			return getRelativeImportPathRojo(state, sourceFile, moduleFile, node);
		}
	} else {
		if (state.rojoProject) {
			return getRelativeImportPathRojo(state, sourceFile, moduleFile, node);
		} else {
			return getRelativeImportPath(state, sourceFile, moduleFile);
		}
	}
}

export function compileImportDeclaration(state: CompilerState, node: ts.ImportDeclaration) {
	const defaultImport = node.getDefaultImport();
	const namespaceImport = node.getNamespaceImport();
	const namedImports = node.getNamedImports();

	const isRoact =
		(defaultImport && defaultImport.getText() === "Roact") ||
		(namespaceImport && namespaceImport.getText() === "Roact");

	if (isRoact) {
		state.hasRoactImport = true;
	}

	const isSideEffect = !defaultImport && !namespaceImport && namedImports.length === 0;

	if (
		!isRoact &&
		!isSideEffect &&
		(!namespaceImport || isUsedAsType(namespaceImport)) &&
		(!defaultImport || isUsedAsType(defaultImport)) &&
		namedImports.every(namedImport => isUsedAsType(namedImport.getNameNode()))
	) {
		return "";
	}

	const moduleFile = node.getModuleSpecifierSourceFile();
	if (!moduleFile) {
		const specifier = node.getModuleSpecifier();
		const text = specifier ? specifier.getText : "unknown";
		throw new CompilerError(
			`Could not find file for '${text}'. Did you forget to "npm install"?`,
			node,
			CompilerErrorType.MissingModuleFile,
		);
	}
	const luaPath = getImportPath(state, node.getSourceFile(), moduleFile, node);

	let result = "";
	if (isSideEffect) {
		state.usesTSLibrary = true;
		return `${luaPath};\n`;
	}

	const lhs = new Array<string>();
	const rhs = new Array<string>();
	const unlocalizedImports = new Array<string>();

	if (defaultImport && (isRoact || !isUsedAsType(defaultImport))) {
		const definitions = defaultImport.getDefinitions();
		const exportAssignments =
			definitions.length > 0 &&
			definitions[0]
				.getNode()
				.getSourceFile()
				.getExportAssignments();

		const defaultImportExp = compileExpression(state, defaultImport);
		checkReserved(defaultImport);

		if (exportAssignments && exportAssignments.length === 1 && exportAssignments[0].isExportEquals()) {
			state.usesTSLibrary = true;
			// If the defaultImport is importing an `export = ` statement,
			return `local ${defaultImportExp} = ${luaPath};\n`;
		}

		lhs.push(defaultImportExp);
		rhs.push(`._default`);
		unlocalizedImports.push("");
	}

	if (namespaceImport && (isRoact || !isUsedAsType(namespaceImport))) {
		lhs.push(compileExpression(state, namespaceImport));
		rhs.push("");
		unlocalizedImports.push("");
	}

	let rhsPrefix: string;
	let hasVarNames = false;

	namedImports
		.filter(namedImport => !isUsedAsType(namedImport.getNameNode()))
		.forEach(namedImport => {
			const aliasNode = namedImport.getAliasNode();
			const nameNode = namedImport.getNameNode();
			const name = nameNode.getText();
			const alias = aliasNode ? aliasNode.getText() : name;
			const shouldLocalize = shouldLocalizeImport(namedImport.getNameNode());

			// keep these here no matter what, so that exports can take from initial state.
			checkReserved(aliasNode || nameNode);
			lhs.push(alias);
			rhs.push(safeLuaIndex(" ", name));

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
		rhsPrefix = state.getNewId();
		result += `local ${rhsPrefix} = ${luaPath};\n`;
	}

	for (let i = 0; i < unlocalizedImports.length; i++) {
		const alias = unlocalizedImports[i];
		if (alias !== "") {
			state.variableAliases.set(alias, rhsPrefix + rhs[i]);
		}
	}

	if (hasVarNames || lhs.length > 0) {
		const lhsStr = lhs.join(", ");
		const rhsStr = rhs.map(v => rhsPrefix + v).join(", ");
		result += `local ${lhsStr} = ${rhsStr};\n`;
	}

	state.usesTSLibrary = true;
	return result;
}

export function compileImportEqualsDeclaration(state: CompilerState, node: ts.ImportEqualsDeclaration) {
	const nameNode = node.getNameNode();
	const name = checkReserved(nameNode);

	const isRoact = name === "Roact";
	if (isRoact) {
		state.hasRoactImport = true;
	}

	if (!isRoact && isUsedAsType(nameNode)) {
		return "";
	}

	const moduleFile = node.getExternalModuleReferenceSourceFile();
	if (!moduleFile) {
		const text = node.getModuleReference().getText();
		throw new CompilerError(
			`Could not find file for '${text}'. Did you forget to "npm install"?`,
			node,
			CompilerErrorType.MissingModuleFile,
		);
	}

	const luaPath = getImportPath(state, node.getSourceFile(), moduleFile, node);
	state.usesTSLibrary = true;
	return state.indent + `local ${name} = ${luaPath};\n`;
}

export function compileExportDeclaration(state: CompilerState, node: ts.ExportDeclaration) {
	let luaPath = "";
	if (node.hasModuleSpecifier()) {
		const moduleFile = node.getModuleSpecifierSourceFile();
		if (!moduleFile) {
			const specifier = node.getModuleSpecifier();
			const text = specifier ? specifier.getText : "unknown";
			throw new CompilerError(
				`Could not find file for '${text}'. Did you forget to "npm install"?`,
				node,
				CompilerErrorType.MissingModuleFile,
			);
		}
		luaPath = getImportPath(state, node.getSourceFile(), moduleFile, node);
	}

	const ancestor =
		node.getFirstAncestorByKind(ts.SyntaxKind.ModuleDeclaration) ||
		node.getFirstAncestorByKind(ts.SyntaxKind.SourceFile);

	if (!ancestor) {
		throw new CompilerError("Could not find export ancestor!", node, CompilerErrorType.BadAncestor, true);
	}

	const lhs = new Array<string>();
	const rhs = new Array<string>();

	if (node.isNamespaceExport()) {
		state.usesTSLibrary = true;
		let ancestorName: string;
		if (ts.TypeGuards.isNamespaceDeclaration(ancestor)) {
			ancestorName = ancestor.getName();
		} else {
			state.isModule = true;
			ancestorName = "_exports";
		}
		return state.indent + `TS.exportNamespace(${luaPath}, ${ancestorName});\n`;
	} else {
		const namedExports = node.getNamedExports().filter(namedExport => !isUsedAsType(namedExport.getNameNode()));
		if (namedExports.length === 0) {
			return "";
		}

		let ancestorName: string;
		if (ts.TypeGuards.isNamespaceDeclaration(ancestor)) {
			ancestorName = ancestor.getName();
		} else {
			state.isModule = true;
			ancestorName = "_exports";
		}

		namedExports.forEach(namedExport => {
			const aliasNode = namedExport.getAliasNode();
			const nameNode = namedExport.getNameNode();
			let name = nameNode.getText();
			if (name === "default") {
				name = "_default";
			}
			const alias = aliasNode ? aliasNode.getText() : name;
			checkReserved(aliasNode || nameNode);
			lhs.push(alias);
			if (luaPath !== "") {
				rhs.push(safeLuaIndex(" ", name));
			} else {
				rhs.push(state.getAlias(name));
			}
		});

		let result = "";
		let rhsPrefix = "";
		const lhsPrefix = ancestorName + ".";
		if (luaPath !== "") {
			if (rhs.length <= 1) {
				rhsPrefix = `${luaPath}`;
			} else {
				rhsPrefix = state.getNewId();
				result += state.indent + `local ${rhsPrefix} = ${luaPath};\n`;
			}
		}
		const lhsStr = lhs.map(v => lhsPrefix + v).join(", ");
		const rhsStr = rhs.map(v => rhsPrefix + v).join(", ");
		result += `${lhsStr} = ${rhsStr};\n`;
		state.usesTSLibrary = true;
		return result;
	}
}

export function compileExportAssignment(state: CompilerState, node: ts.ExportAssignment) {
	const exp = skipNodesDownwards(node.getExpression());
	if (node.isExportEquals() && (!ts.TypeGuards.isIdentifier(exp) || !isUsedAsType(exp))) {
		state.isModule = true;
		state.enterPrecedingStatementContext();
		const expStr = compileExpression(state, exp);
		return state.exitPrecedingStatementContextAndJoin() + `_exports = ${expStr};\n`;
	} else {
		const symbol = node.getSymbol();
		if (symbol) {
			if (symbol.getName() === "default") {
				state.isModule = true;
				state.enterPrecedingStatementContext();
				const expStr = compileExpression(state, exp);
				return state.exitPrecedingStatementContextAndJoin() + "_exports._default = " + expStr + ";\n";
			}
		}
	}
	return "";
}
