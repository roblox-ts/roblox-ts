import ts from "byots";
import { TransformState } from "TSTransformer";
import { ROACT_SYMBOL_NAMES } from "TSTransformer/classes/RoactSymbolManager";
import { getExtendsNode } from "TSTransformer/util/getExtendsNode";

export function extendsRoactComponent(state: TransformState, node: ts.ClassLikeDeclaration) {
	if (state.roactSymbolManager) {
		const extendsNode = getExtendsNode(node);
		if (extendsNode) {
			const aliasSymbol = state.typeChecker.getSymbolAtLocation(extendsNode.expression);
			if (aliasSymbol) {
				const originalSymbol = ts.skipAlias(aliasSymbol, state.typeChecker);
				return (
					originalSymbol === state.roactSymbolManager.getSymbolOrThrow(ROACT_SYMBOL_NAMES.Component) ||
					originalSymbol === state.roactSymbolManager.getSymbolOrThrow(ROACT_SYMBOL_NAMES.PureComponent)
				);
			}
		}
	}
	return false;
}
