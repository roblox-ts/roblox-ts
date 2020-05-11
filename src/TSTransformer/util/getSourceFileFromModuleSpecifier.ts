import ts, { transformSystemModule } from "byots";
import { TransformState } from "TSTransformer/TransformState";

export function getSourceFileFromModuleSpecifier(state: TransformState, moduleSpecifier: ts.StringLiteral) {
	const symbol = state.typeChecker.getSymbolAtLocation(moduleSpecifier);
	if (symbol) {
		return symbol.valueDeclaration as ts.SourceFile;
	}
}
