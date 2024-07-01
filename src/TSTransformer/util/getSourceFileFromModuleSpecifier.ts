import { TransformState } from "TSTransformer/classes/TransformState";
import ts from "typescript";

export function getSourceFileFromModuleSpecifier(state: TransformState, moduleSpecifier: ts.Expression) {
	const symbol =
		state.typeChecker.getSymbolAtLocation(moduleSpecifier) ??
		state.typeChecker.resolveExternalModuleName(moduleSpecifier);
	if (symbol) {
		const declaration = symbol.valueDeclaration;

		if (declaration && ts.isModuleDeclaration(declaration) && ts.isStringLiteralLike(declaration.name)) {
			const sourceFile = moduleSpecifier.getSourceFile();
			const mode = state.program.getModeForUsageLocation(sourceFile, declaration.name);
			const resolvedModuleInfo = state.program.getResolvedModule(sourceFile, declaration.name.text, mode);
			if (resolvedModuleInfo && resolvedModuleInfo.resolvedModule) {
				return state.program.getSourceFile(resolvedModuleInfo.resolvedModule.resolvedFileName);
			}
		}

		if (declaration && ts.isSourceFile(declaration)) {
			return declaration;
		}
	}

	// Fallback for $getModuleTree when module is not referenced by any regular import
	if (ts.isStringLiteralLike(moduleSpecifier)) {
		const sourceFile = moduleSpecifier.getSourceFile();
		const result = ts.resolveModuleName(moduleSpecifier.text, sourceFile.path, state.compilerOptions, ts.sys);
		if (result.resolvedModule) {
			return state.program.getSourceFile(result.resolvedModule.resolvedFileName);
		}
	}
}
