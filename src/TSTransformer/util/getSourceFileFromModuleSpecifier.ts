import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer/classes/TransformState";
import ts from "typescript";

export function getSourceFileFromModuleSpecifier(state: TransformState, moduleSpecifier: ts.Expression) {
	const symbol = state.typeChecker.getSymbolAtLocation(moduleSpecifier);
	if (symbol) {
		const declaration = symbol.valueDeclaration;

		if (declaration && ts.isModuleDeclaration(declaration) && ts.isStringLiteralLike(declaration.name)) {
			const sourceFile = moduleSpecifier.getSourceFile();
			const mode = ts.getModeForUsageLocation(sourceFile, declaration.name);
			const resolvedModuleInfo = ts.getResolvedModule(sourceFile, declaration.name.text, mode);
			if (resolvedModuleInfo) {
				return state.program.getSourceFile(resolvedModuleInfo.resolvedFileName);
			}
		}

		assert(declaration && ts.isSourceFile(declaration));
		return declaration;
	}
}
