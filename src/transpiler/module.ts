import * as ts from "ts-morph";
import { checkReserved, transpileClassDeclaration, transpileExpression } from ".";
import { TranspilerError, TranspilerErrorType } from "../class/errors/TranspilerError";
import { TranspilerState } from "../class/TranspilerState";

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

export function transpileImportDeclaration(state: TranspilerState, node: ts.ImportDeclaration) {
	let luaPath: string;
	if (node.isModuleSpecifierRelative()) {
		luaPath = state.compiler.getRelativeImportPath(
			node.getSourceFile(),
			node.getModuleSpecifierSourceFile(),
			node.getModuleSpecifier().getLiteralText(),
		);
	} else {
		const moduleFile = node.getModuleSpecifierSourceFile();
		if (moduleFile) {
			luaPath = state.compiler.getImportPathFromFile(node.getSourceFile(), moduleFile);
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
			luaPath = state.compiler.getRelativeImportPath(node.getSourceFile(), moduleFile, specifier);
		} else {
			luaPath = state.compiler.getImportPathFromFile(node.getSourceFile(), moduleFile);
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
	let luaPath: string = "";
	const moduleSpecifier = node.getModuleSpecifier();
	if (moduleSpecifier) {
		if (node.isModuleSpecifierRelative()) {
			luaPath = state.compiler.getRelativeImportPath(
				node.getSourceFile(),
				node.getModuleSpecifierSourceFile(),
				moduleSpecifier.getLiteralText(),
			);
		} else {
			const moduleFile = node.getModuleSpecifierSourceFile();
			if (moduleFile) {
				luaPath = state.compiler.getImportPathFromFile(node.getSourceFile(), moduleFile);
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
		if (!moduleSpecifier) {
			throw new TranspilerError(
				"Namespace exports require a module specifier!",
				node,
				TranspilerErrorType.BadSpecifier,
			);
		}
		return state.indent + `TS.exportNamespace(require(${luaPath}), ${ancestorName});\n`;
	} else {
		const namedExports = node.getNamedExports();
		if (namedExports.length === 0) {
			return "";
		}
		namedExports.forEach(namedExport => {
			const aliasNode = namedExport.getAliasNode();
			let name = namedExport.getNameNode().getText();
			if (name === "default") {
				name = "_" + name;
			}
			const alias = aliasNode ? aliasNode.getText() : name;
			checkReserved(alias, node);
			lhs.push(alias);
			if (luaPath !== "") {
				rhs.push(`.${name}`);
			} else {
				rhs.push(name);
			}
		});

		let result = "";
		let rhsPrefix: string;
		const lhsPrefix = ancestorName + ".";
		if (rhs.length <= 1) {
			rhsPrefix = luaPath !== "" ? `require(${luaPath})` : "";
		} else {
			rhsPrefix = state.getNewId();
			result += `${rhsPrefix} = require(${luaPath});\n`;
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
		const exp = node.getExpression();
		if (ts.TypeGuards.isClassExpression(exp)) {
			const className = exp.getName() || state.getNewId();
			result += transpileClassDeclaration(state, exp, className);
			result += state.indent;
			result += `_exports = ${className};\n`;
		} else {
			const expStr = transpileExpression(state, exp);
			result += `_exports = ${expStr};\n`;
		}
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
