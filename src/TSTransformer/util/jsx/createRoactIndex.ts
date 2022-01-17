import luau from "@roblox-ts/luau-ast";
import { propertyAccessExpressionChain } from "TSTransformer/util/expressionChain";

export function createRoactIndex(...indices: Array<string>) {
	return propertyAccessExpressionChain(luau.id("Roact"), indices);
}
