import luau from "@roblox-ts/luau-ast";
import { propertyAccessExpressionChain } from "TSTransformer/util/expressionChain";

export function getJsxIndex(factory: string) {
	const [namespace, ...path] = factory.split(".");
	return propertyAccessExpressionChain(luau.id(namespace), path);
}
