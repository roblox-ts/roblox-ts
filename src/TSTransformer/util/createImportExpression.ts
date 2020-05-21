import ts from "byots";
import * as lua from "LuaAST";
import path from "path";
import fs from "fs-extra";
import { diagnostics } from "Shared/diagnostics";
import { FileRelation, RbxPath, RbxPathParent, RbxType, RojoConfig } from "Shared/RojoConfig";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { createGetService } from "TSTransformer/util/createGetService";
import { propertyAccessExpressionChain } from "TSTransformer/util/expressionChain";

function getSourceFileFromModuleSpecifier(state: TransformState, moduleSpecifier: ts.StringLiteral) {
	const symbol = state.typeChecker.getSymbolAtLocation(moduleSpecifier);
	if (symbol) {
		assert(ts.isSourceFile(symbol.valueDeclaration));
		return symbol.valueDeclaration;
	}
}

function getAbsoluteImport(moduleRbxPath: RbxPath) {
	const pathExpressions = lua.list.make<lua.Expression>();
	const serviceName = moduleRbxPath.shift();
	assert(serviceName);
	lua.list.push(pathExpressions, createGetService(serviceName));
	for (const pathPart of moduleRbxPath) {
		lua.list.push(pathExpressions, lua.string(pathPart));
	}
	return pathExpressions;
}

const PARENT_FIELD = "Parent";

function getRelativeImport(sourceRbxPath: RbxPath, moduleRbxPath: RbxPath) {
	const relativePath = RojoConfig.relative(sourceRbxPath, moduleRbxPath);

	// create descending path pieces
	const path = new Array<string>();
	let i = 0;
	while (relativePath[i] === RbxPathParent) {
		path.push(PARENT_FIELD);
		i++;
	}

	const pathExpressions = lua.list.make<lua.Expression>(propertyAccessExpressionChain(lua.globals.script, path));

	// create descending path pieces
	for (; i < relativePath.length; i++) {
		const pathPart = relativePath[i];
		assert(typeof pathPart === "string");
		lua.list.push(pathExpressions, lua.string(pathPart));
	}

	return pathExpressions;
}

function getNodeModulesImport(state: TransformState, moduleSpecifier: ts.StringLiteral, moduleFilePath: string) {
	const pkgName = path
		.relative(state.nodeModulesPath, moduleFilePath)
		.split(path.sep)
		.shift()!;

	if (!state.moduleIsPathMapped.get(pkgName)) {
		state.moduleIsPathMapped.set(pkgName, true);
		const pkgPath = path.join(state.nodeModulesPath, pkgName);
		const pkgJsonPath = path.join(pkgPath, "package.json");
		if (fs.existsSync(pkgJsonPath)) {
			const pkgJson = fs.readJSONSync(pkgJsonPath) as { main?: string; typings?: string; types?: string };
			const mainPath = pkgJson.main;
			// both types and typings are valid
			const typesPath = pkgJson.types ?? pkgJson.typings;
			if (mainPath && typesPath) {
				state.modulePathMapping.set(path.resolve(pkgPath, typesPath), path.resolve(pkgPath, mainPath));
			}
		}
	}

	const moduleOutPath = state.pathTranslator.getImportPath(
		state.modulePathMapping.get(moduleFilePath) ?? moduleFilePath,
	);
	const moduleRbxPath = state.rojoConfig.getRbxPathFromFilePath(moduleOutPath);
	if (!moduleRbxPath) {
		state.addDiagnostic(diagnostics.noRojoData(moduleSpecifier));
		return lua.emptyId();
	}

	assert(state.nodeModulesRbxPath);
	const relativeToNodeModulesRbxPath = RojoConfig.relative(state.nodeModulesRbxPath, moduleRbxPath);
	const moduleName = relativeToNodeModulesRbxPath.shift();
	assert(moduleName && typeof moduleName === "string");
	assert(relativeToNodeModulesRbxPath[0] !== RbxPathParent);

	return propertyAccessExpressionChain(
		lua.create(lua.SyntaxKind.CallExpression, {
			expression: state.TS("getModule"),
			args: lua.list.make<lua.Expression>(lua.globals.script, lua.string(moduleName)),
		}),
		relativeToNodeModulesRbxPath as Array<string>,
	);
}

export function createImportExpression(
	state: TransformState,
	sourceFile: ts.SourceFile,
	moduleSpecifier: ts.StringLiteral,
): lua.IndexableExpression {
	const moduleFile = getSourceFileFromModuleSpecifier(state, moduleSpecifier);
	if (!moduleFile) {
		state.addDiagnostic(diagnostics.noModuleSpecifierFile(moduleSpecifier));
		return lua.emptyId();
	}

	const importPathExpressions = lua.list.make<lua.Expression>();
	lua.list.push(importPathExpressions, lua.globals.script);

	if (ts.isInsideNodeModules(moduleFile.fileName)) {
		lua.list.push(importPathExpressions, getNodeModulesImport(state, moduleSpecifier, moduleFile.fileName));
	} else {
		const moduleOutPath = state.pathTranslator.getImportPath(moduleFile.fileName);
		const moduleRbxPath = state.rojoConfig.getRbxPathFromFilePath(moduleOutPath);
		if (!moduleRbxPath) {
			state.addDiagnostic(diagnostics.noRojoData(moduleSpecifier));
			return lua.emptyId();
		}

		const moduleRbxType = state.rojoConfig.getRbxTypeFromFilePath(moduleOutPath);
		if (moduleRbxType === RbxType.Script || moduleRbxType === RbxType.LocalScript) {
			state.addDiagnostic(diagnostics.noNonModuleImport(moduleSpecifier));
			return lua.emptyId();
		}

		const sourceOutPath = state.pathTranslator.getOutputPath(sourceFile.fileName);
		const sourceRbxPath = state.rojoConfig.getRbxPathFromFilePath(sourceOutPath);
		if (!sourceRbxPath) {
			state.addDiagnostic(diagnostics.noRojoData(sourceFile));
			return lua.emptyId();
		}

		if (state.rojoConfig.isGame()) {
			const fileRelation = state.rojoConfig.getFileRelation(sourceRbxPath, moduleRbxPath);
			if (fileRelation === FileRelation.OutToOut || fileRelation === FileRelation.InToOut) {
				lua.list.pushList(importPathExpressions, getAbsoluteImport(moduleRbxPath));
			} else if (fileRelation === FileRelation.InToIn) {
				lua.list.pushList(importPathExpressions, getRelativeImport(sourceRbxPath, moduleRbxPath));
			} else {
				state.addDiagnostic(diagnostics.noIsolatedImport(moduleSpecifier));
				return lua.emptyId();
			}
		} else {
			lua.list.pushList(importPathExpressions, getRelativeImport(sourceRbxPath, moduleRbxPath));
		}
	}

	return lua.create(lua.SyntaxKind.CallExpression, {
		expression: state.TS("import"),
		args: importPathExpressions,
	});
}
