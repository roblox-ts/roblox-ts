import ts from "byots";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import { TransformState } from "TSTransformer";
import { getAncestor } from "TSTransformer/util/traversal";

export function isDefinedAsLet(state: TransformState, idSymbol: ts.Symbol) {
	return getOrSetDefault(
		state.multiTransformState.isDefinedAsLetCache,
		idSymbol,
		() => !!((getAncestor(idSymbol.valueDeclaration, ts.isVariableDeclarationList)?.flags ?? 0) & ts.NodeFlags.Let),
	);
}
