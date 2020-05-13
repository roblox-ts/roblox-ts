import ts from "byots";
import { TransformState } from "TSTransformer";
import { getAncestor } from "TSTransformer/util/traversal";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";

export function isDefinedAsLet(state: TransformState, idSymbol: ts.Symbol) {
	return getOrSetDefault(
		state.compileState.isDefinedAsLetCache,
		idSymbol,
		() => !!((getAncestor(idSymbol.valueDeclaration, ts.isVariableDeclarationList)?.flags ?? 0) & ts.NodeFlags.Let),
	);
}
