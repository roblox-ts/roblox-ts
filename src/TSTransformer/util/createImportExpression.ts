import ts from "byots";
import * as lua from "LuaAST";
import { ProjectType } from "Shared/constants";
import { FileRelation, RbxPath, RbxPathParent, RbxType, RojoConfig } from "Shared/RojoConfig";
import { assert } from "Shared/util/assert";
import { diagnostics } from "TSTransformer/diagnostics";
import { TransformState } from "TSTransformer/TransformState";
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
	const path = [PARENT_FIELD];
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

	const moduleOutPath = state.pathTranslator.getImportPath(moduleFile.fileName);
	const moduleRbxPath = state.rojoConfig.getRbxPathFromFilePath(moduleOutPath);
	if (!moduleRbxPath) {
		state.addDiagnostic(diagnostics.noRojoData(moduleSpecifier));
		return lua.emptyId();
	}

	const importPathExpressions = lua.list.make<lua.Expression>();
	lua.list.push(importPathExpressions, lua.globals.script);

	// TODO if moduleFile.fileName == package.json "main", swap for "main"?
	if (ts.isInsideNodeModules(moduleFile.fileName)) {
		assert(state.nodeModulesRbxPath);
		const relativeToNodeModulesRbxPath = RojoConfig.relative(state.nodeModulesRbxPath, moduleRbxPath);
		const moduleName = relativeToNodeModulesRbxPath.shift();
		assert(moduleName && typeof moduleName === "string");
		assert(relativeToNodeModulesRbxPath[0] !== RbxPathParent);
		lua.list.push(
			importPathExpressions,
			propertyAccessExpressionChain(
				lua.create(lua.SyntaxKind.CallExpression, {
					expression: state.TS("getModule"),
					args: lua.list.make<lua.Expression>(lua.globals.script, lua.string(moduleName)),
				}),
				relativeToNodeModulesRbxPath as Array<string>,
			),
		);
		return lua.create(lua.SyntaxKind.CallExpression, {
			expression: state.TS("import"),
			args: importPathExpressions,
		});
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

	return lua.create(lua.SyntaxKind.CallExpression, {
		expression: state.TS("import"),
		args: importPathExpressions,
	});
}
