import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import { TransformState } from "TSTransformer";
import { getAncestor } from "TSTransformer/util/traversal";
import ts from "typescript";

export function isSymbolMutable(state: TransformState, idSymbol: ts.Symbol) {
	return getOrSetDefault(state.multiTransformState.isDefinedAsLetCache, idSymbol, () => {
		if (idSymbol.valueDeclaration) {
			if (ts.isParameter(idSymbol.valueDeclaration)) {
				return true;
			}

			const varDecList = getAncestor(idSymbol.valueDeclaration, ts.isVariableDeclarationList);
			if (varDecList) {
				return !!(varDecList.flags & ts.NodeFlags.Let);
			}
		}
		return false;
	});
}
