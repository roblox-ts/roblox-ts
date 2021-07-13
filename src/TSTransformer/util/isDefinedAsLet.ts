import ts from "byots";
import { assert } from "Shared/util/assert";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import { TransformState } from "TSTransformer";
import { getAncestor } from "TSTransformer/util/traversal";

export function isDefinedAsLet(state: TransformState, idSymbol: ts.Symbol) {
	return getOrSetDefault(state.multiTransformState.isDefinedAsLetCache, idSymbol, () => {
		assert(idSymbol.valueDeclaration);
		return !!(
			(getAncestor(idSymbol.valueDeclaration, ts.isVariableDeclarationList)?.flags ?? 0) & ts.NodeFlags.Let
		);
	});
}
