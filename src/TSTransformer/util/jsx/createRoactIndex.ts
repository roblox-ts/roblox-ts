import luau from "LuauAST";
import { propertyAccessExpressionChain } from "TSTransformer/util/expressionChain";

export function createRoactIndex(...indices: Array<string>) {
	return propertyAccessExpressionChain(luau.id("Roact"), indices);
}
