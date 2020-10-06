import ts from "byots";
import luau from "LuauAST";
import path from "path";
import { FileRelation, RbxPath, RbxPathParent, RbxType, RojoResolver } from "Shared/classes/RojoResolver";
import { PARENT_FIELD, ProjectType } from "Shared/constants";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { createGetService } from "TSTransformer/util/createGetService";
import { propertyAccessExpressionChain } from "TSTransformer/util/expressionChain";
import { getSourceFileFromModuleSpecifier } from "TSTransformer/util/getSourceFileFromModuleSpecifier";

function getAbsoluteImport(moduleRbxPath: RbxPath) {
	const pathExpressions = new Array<luau.Expression>();
	const serviceName = moduleRbxPath[0];
	assert(serviceName);
	pathExpressions.push(createGetService(serviceName));
	for (let i = 1; i < moduleRbxPath.length; i++) {
		pathExpressions.push(luau.string(moduleRbxPath[i]));
	}
	return pathExpressions;
}

function getRelativeImport(sourceRbxPath: RbxPath, moduleRbxPath: RbxPath) {
	const relativePath = RojoResolver.relative(sourceRbxPath, moduleRbxPath);

	// create descending path pieces
	const path = new Array<string>();
	let i = 0;
	while (relativePath[i] === RbxPathParent) {
		path.push(PARENT_FIELD);
		i++;
	}

	const pathExpressions: Array<luau.Expression> = [propertyAccessExpressionChain(luau.globals.script, path)];

	// create descending path pieces
	for (; i < relativePath.length; i++) {
		const pathPart = relativePath[i];
		assert(typeof pathPart === "string");
		pathExpressions.push(luau.string(pathPart));
	}

	return pathExpressions;
}

function getNodeModulesImport(state: TransformState, moduleSpecifier: ts.Expression, moduleFilePath: string) {
	const moduleOutPath = state.services.pathTranslator.getImportPath(
		state.data.nodeModulesPathMapping.get(path.normalize(moduleFilePath)) ?? moduleFilePath,
		/* isNodeModule */ true,
	);
	const moduleRbxPath = state.rojoResolver.getRbxPathFromFilePath(moduleOutPath);
	if (!moduleRbxPath) {
		state.addDiagnostic(errors.noRojoData(moduleSpecifier));
		return luau.emptyId();
	}

	assert(state.nodeModulesRbxPath);
	const relativeToNodeModulesRbxPath = RojoResolver.relative(state.nodeModulesRbxPath, moduleRbxPath);
	const moduleName = relativeToNodeModulesRbxPath[0];
	assert(moduleName && typeof moduleName === "string");
	assert(relativeToNodeModulesRbxPath[1] !== RbxPathParent);

	return propertyAccessExpressionChain(
		luau.call(state.TS("getModule"), [luau.globals.script, luau.string(moduleName)]),
		relativeToNodeModulesRbxPath.slice(1) as Array<string>,
	);
}

export function createImportExpression(
	state: TransformState,
	sourceFile: ts.SourceFile,
	moduleSpecifier: ts.Expression,
): luau.CallExpression | luau.EmptyIdentifier {
	const moduleFile = getSourceFileFromModuleSpecifier(state.typeChecker, moduleSpecifier);
	if (!moduleFile) {
		state.addDiagnostic(errors.noModuleSpecifierFile(moduleSpecifier));
		return luau.emptyId();
	}

	const importPathExpressions = new Array<luau.Expression>();
	importPathExpressions.push(luau.globals.script);

	const virtualPath = state.guessVirtualPath(moduleFile.fileName);
	if (ts.isInsideNodeModules(virtualPath)) {
		importPathExpressions.push(getNodeModulesImport(state, moduleSpecifier, virtualPath));
	} else {
		const moduleOutPath = state.services.pathTranslator.getImportPath(virtualPath);
		const moduleRbxPath = state.rojoResolver.getRbxPathFromFilePath(moduleOutPath);
		if (!moduleRbxPath) {
			state.addDiagnostic(errors.noRojoData(moduleSpecifier));
			return luau.emptyId();
		}

		const moduleRbxType = state.rojoResolver.getRbxTypeFromFilePath(moduleOutPath);
		if (moduleRbxType === RbxType.Script || moduleRbxType === RbxType.LocalScript) {
			state.addDiagnostic(errors.noNonModuleImport(moduleSpecifier));
			return luau.emptyId();
		}

		const sourceOutPath = state.services.pathTranslator.getOutputPath(sourceFile.fileName);
		const sourceRbxPath = state.rojoResolver.getRbxPathFromFilePath(sourceOutPath);
		if (!sourceRbxPath) {
			state.addDiagnostic(errors.noRojoData(sourceFile));
			return luau.emptyId();
		}

		if (state.projectType === ProjectType.Game) {
			const fileRelation = state.rojoResolver.getFileRelation(sourceRbxPath, moduleRbxPath);
			if (fileRelation === FileRelation.OutToOut || fileRelation === FileRelation.InToOut) {
				importPathExpressions.push(...getAbsoluteImport(moduleRbxPath));
			} else if (fileRelation === FileRelation.InToIn) {
				importPathExpressions.push(...getRelativeImport(sourceRbxPath, moduleRbxPath));
			} else {
				state.addDiagnostic(errors.noIsolatedImport(moduleSpecifier));
				return luau.emptyId();
			}
		} else {
			importPathExpressions.push(...getRelativeImport(sourceRbxPath, moduleRbxPath));
		}
	}

	return luau.call(state.TS("import"), importPathExpressions);
}
