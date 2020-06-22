import ts from "byots";
import * as lua from "LuaAST";
import path from "path";
import { FileRelation, RbxPath, RbxPathParent, RbxType, RojoConfig } from "Shared/classes/RojoConfig";
import { diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { createGetService } from "TSTransformer/util/createGetService";
import { propertyAccessExpressionChain } from "TSTransformer/util/expressionChain";
import { getSourceFileFromModuleSpecifier } from "TSTransformer/util/getSourceFileFromModuleSpecifier";

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

function getNodeModulesImport(state: TransformState, moduleSpecifier: ts.Expression, moduleFilePath: string) {
	const moduleOutPath = state.pathTranslator.getImportPath(
		state.nodeModulesPathMapping.get(path.normalize(moduleFilePath)) ?? moduleFilePath,
		/* isNodeModule */ true,
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
	moduleSpecifier: ts.Expression,
): lua.CallExpression | lua.EmptyIdentifier {
	const moduleFile = getSourceFileFromModuleSpecifier(state.typeChecker, moduleSpecifier);
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
