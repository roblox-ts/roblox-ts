import ts from "byots";
import luau from "LuauAST";
import path from "path";
import { FileRelation, RbxPath, RbxPathParent, RbxType, RojoResolver } from "Shared/classes/RojoResolver";
import { PARENT_FIELD, ProjectType } from "Shared/constants";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { createGetService } from "TSTransformer/util/createGetService";
import { propertyAccessExpressionChain } from "TSTransformer/util/expressionChain";
import { getSourceFileFromModuleSpecifier } from "TSTransformer/util/getSourceFileFromModuleSpecifier";

function getAbsoluteImport(moduleRbxPath: RbxPath, nestedFolder?: string) {
	const pathExpressions = new Array<luau.Expression>();
	const serviceName = moduleRbxPath[0];
	assert(serviceName);
	pathExpressions.push(createGetService(serviceName));
	if (nestedFolder) {
		pathExpressions.push(luau.string(nestedFolder));
	}
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

function validateModule(state: TransformState, scope: string) {
	const scopedModules = path.join(state.data.nodeModulesPath, scope);
	if (state.compilerOptions.typeRoots) {
		for (const typeRoot of state.compilerOptions.typeRoots) {
			if (path.normalize(scopedModules) === path.normalize(typeRoot)) {
				return true;
			}
		}
	}
	return false;
}

function findRelativeRbxPath(moduleOutPath: string, pkgRojoResolvers: Array<RojoResolver>) {
	for (const pkgRojoResolver of pkgRojoResolvers) {
		const relativeRbxPath = pkgRojoResolver.getRbxPathFromFilePath(moduleOutPath);
		if (relativeRbxPath) {
			return relativeRbxPath;
		}
	}
}

function getNodeModulesImport(state: TransformState, moduleSpecifier: ts.Expression, moduleFilePath: string) {
	const moduleOutPath = state.pathTranslator.getImportPath(
		state.nodeModulesPathMapping.get(path.normalize(moduleFilePath)) ?? moduleFilePath,
		/* isNodeModule */ true,
	);
	const gameRbxPath = state.rojoResolver.getRbxPathFromFilePath(moduleOutPath);
	const relativeRbxPath = findRelativeRbxPath(moduleOutPath, state.pkgRojoResolvers);
	if (!relativeRbxPath || (!state.data.isPackage && !gameRbxPath)) {
		DiagnosticService.addDiagnostic(
			errors.noRojoData(moduleSpecifier, path.relative(state.data.projectPath, moduleOutPath)),
		);
		return luau.emptyId();
	}

	const relativeFilePath = path.relative(state.data.nodeModulesPath, moduleOutPath);
	const moduleScope = relativeFilePath.split(path.sep)[0];
	assert(moduleScope && typeof moduleScope === "string");

	if (!moduleScope.startsWith("@")) {
		DiagnosticService.addDiagnostic(errors.noUnscopedModule(moduleSpecifier));
		return luau.emptyId();
	}

	const moduleName = relativeRbxPath[0];
	assert(moduleName && typeof moduleName === "string");

	if (!validateModule(state, moduleScope)) {
		DiagnosticService.addDiagnostic(errors.noInvalidModule(moduleSpecifier));
		return luau.emptyId();
	}

	return propertyAccessExpressionChain(
		luau.call(state.TS(moduleSpecifier.parent, "getModule"), [
			luau.globals.script,
			luau.string(moduleScope),
			luau.string(moduleName),
		]),
		relativeRbxPath.slice(1),
	);
}

export function createImportExpression(
	state: TransformState,
	sourceFile: ts.SourceFile,
	moduleSpecifier: ts.Expression,
): luau.CallExpression | luau.EmptyIdentifier {
	const moduleFile = getSourceFileFromModuleSpecifier(state.typeChecker, moduleSpecifier);
	if (!moduleFile) {
		DiagnosticService.addDiagnostic(errors.noModuleSpecifierFile(moduleSpecifier));
		return luau.emptyId();
	}

	const importPathExpressions = new Array<luau.Expression>();
	importPathExpressions.push(luau.globals.script);

	const virtualPath = state.guessVirtualPath(moduleFile.fileName);
	if (ts.isInsideNodeModules(virtualPath)) {
		importPathExpressions.push(getNodeModulesImport(state, moduleSpecifier, virtualPath));
	} else {
		const moduleOutPath = state.pathTranslator.getImportPath(virtualPath);
		const moduleRbxPath = state.rojoResolver.getRbxPathFromFilePath(moduleOutPath);
		if (!moduleRbxPath) {
			DiagnosticService.addDiagnostic(
				errors.noRojoData(moduleSpecifier, path.relative(state.data.projectPath, moduleOutPath)),
			);
			return luau.emptyId();
		}

		const moduleRbxType = state.rojoResolver.getRbxTypeFromFilePath(moduleOutPath);
		if (moduleRbxType === RbxType.Script || moduleRbxType === RbxType.LocalScript) {
			DiagnosticService.addDiagnostic(errors.noNonModuleImport(moduleSpecifier));
			return luau.emptyId();
		}

		const sourceOutPath = state.pathTranslator.getOutputPath(sourceFile.fileName);
		const sourceRbxPath = state.rojoResolver.getRbxPathFromFilePath(sourceOutPath);
		if (!sourceRbxPath) {
			DiagnosticService.addDiagnostic(
				errors.noRojoData(sourceFile, path.relative(state.data.projectPath, sourceOutPath)),
			);
			return luau.emptyId();
		}

		if (state.projectType === ProjectType.Game || state.projectType === ProjectType.DynamicModel) {
			const fileRelation = state.rojoResolver.getFileRelation(sourceRbxPath, moduleRbxPath);
			if (fileRelation === FileRelation.OutToOut || fileRelation === FileRelation.InToOut) {
				importPathExpressions.push(
					...getAbsoluteImport(
						moduleRbxPath,
						ProjectType.DynamicModel ? (state.rojoResolver.isDmodel as string) : undefined,
					),
				);
			} else if (fileRelation === FileRelation.InToIn) {
				importPathExpressions.push(...getRelativeImport(sourceRbxPath, moduleRbxPath));
			} else {
				DiagnosticService.addDiagnostic(errors.noIsolatedImport(moduleSpecifier));
				return luau.emptyId();
			}
		} else {
			importPathExpressions.push(...getRelativeImport(sourceRbxPath, moduleRbxPath));
		}
	}

	return luau.call(state.TS(moduleSpecifier.parent, "import"), importPathExpressions);
}
