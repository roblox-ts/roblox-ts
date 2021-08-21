import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { propertyAccessExpressionChain } from "TSTransformer/util/expressionChain";

export function createRoactIndex(state: TransformState, ...indices: Array<string>) {
	return propertyAccessExpressionChain(luau.id(state.jsxProvider), indices);
}
