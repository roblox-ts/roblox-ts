import ts from "byots";
import * as lua from "LuaAST";
import { FileRelation, RbxPathParent, RojoConfig, RbxPath } from "Shared/RojoConfig";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer/TransformState";
import { propertyAccessExpressionChain } from "TSTransformer/util/expressionChain";
import { diagnostics } from "TSTransformer/diagnostics";
import { createGetService } from "TSTransformer/util/createGetService";

const PARENT_FIELD = "Parent";

function getSourceFileFromModuleSpecifier(state: TransformState, moduleSpecifier: ts.StringLiteral) {
	const symbol = state.typeChecker.getSymbolAtLocation(moduleSpecifier);
	if (symbol) {
		return symbol.valueDeclaration as ts.SourceFile;
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

function getRelativeImport(sourceRbxPath: RbxPath, moduleRbxPath: RbxPath) {
	const pathExpressions = lua.list.make<lua.Expression>();
	const path = [PARENT_FIELD];
	const relativePath = RojoConfig.relative(sourceRbxPath, moduleRbxPath);
	let i = 0;
	while (relativePath[i] === RbxPathParent) {
		path.push(PARENT_FIELD);
		i++;
	}
	lua.list.push(pathExpressions, propertyAccessExpressionChain(lua.globals.script, path));
	for (; i < relativePath.length; i++) {
		const pathPart = relativePath[i];
		assert(typeof pathPart === "string");
		lua.list.push(pathExpressions, lua.string(pathPart));
	}
	return pathExpressions;
}

export function createImportExpression(
	state: TransformState,
	sourceFile: ts.SourceFile,
	moduleSpecifier: ts.StringLiteral,
) {
	const sourceOutPath = state.pathTranslator.getOutPath(sourceFile.fileName);
	const sourceRbxPath = state.rojoConfig.getRbxPathFromFilePath(sourceOutPath);
	if (!sourceRbxPath) {
		state.addDiagnostic(diagnostics.noRojoData(sourceFile));
		return lua.emptyId();
	}

	const moduleFile = getSourceFileFromModuleSpecifier(state, moduleSpecifier);
	if (!moduleFile) {
		state.addDiagnostic(diagnostics.noModuleSpecifierFile(moduleSpecifier));
		return lua.emptyId();
	}

	const moduleOutPath = state.pathTranslator.getOutPath(moduleFile.fileName);
	const moduleRbxPath = state.rojoConfig.getRbxPathFromFilePath(moduleOutPath);
	if (!moduleRbxPath) {
		state.addDiagnostic(diagnostics.noRojoData(moduleSpecifier));
		return lua.emptyId();
	}

	if (state.rojoConfig.getRbxTypeFromFilePath(moduleOutPath) !== "ModuleScript") {
		state.addDiagnostic(diagnostics.noNonModuleImport(moduleSpecifier));
		return lua.emptyId();
	}

	const fileRelation = state.rojoConfig.getFileRelation(sourceRbxPath, moduleRbxPath);

	const importPathExpressions = lua.list.make<lua.Expression>();
	lua.list.push(importPathExpressions, lua.globals.script);

	if (fileRelation === FileRelation.OutToOut || fileRelation === FileRelation.InToOut) {
		lua.list.pushList(importPathExpressions, getAbsoluteImport(moduleRbxPath));
	} else if (fileRelation === FileRelation.InToIn) {
		lua.list.pushList(importPathExpressions, getRelativeImport(sourceRbxPath, moduleRbxPath));
	} else {
		state.addDiagnostic(diagnostics.noIsolatedImport(moduleSpecifier));
		return lua.emptyId();
	}

	// TODO: handle non-Game logic

	return lua.create(lua.SyntaxKind.CallExpression, {
		expression: state.TS("import"),
		args: importPathExpressions,
	});
}
