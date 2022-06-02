import { TransformState } from "TSTransformer";
import { ROACT_SYMBOL_NAMES } from "TSTransformer/classes/RoactSymbolManager";
import { getExtendsNode } from "TSTransformer/util/getExtendsNode";
import { getOriginalSymbolOfNode } from "TSTransformer/util/getOriginalSymbolOfNode";
import ts from "typescript";

export function extendsRoactComponent(state: TransformState, node: ts.ClassLikeDeclaration) {
	if (state.services.roactSymbolManager) {
		const extendsNode = getExtendsNode(node);
		if (extendsNode) {
			const symbol = getOriginalSymbolOfNode(state.typeChecker, extendsNode.expression);
			if (symbol) {
				return (
					symbol === state.services.roactSymbolManager.getSymbolOrThrow(ROACT_SYMBOL_NAMES.Component) ||
					symbol === state.services.roactSymbolManager.getSymbolOrThrow(ROACT_SYMBOL_NAMES.PureComponent)
				);
			}
		}
	}
	return false;
}
