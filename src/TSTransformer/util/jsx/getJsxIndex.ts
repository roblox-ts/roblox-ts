import luau from "@roblox-ts/luau-ast";
import assert from "assert";
import { TransformState } from "TSTransformer/classes/TransformState";
import { propertyAccessExpressionChain } from "TSTransformer/util/expressionChain";

function getJsxIndex(factory: string) {
	const [namespace, ...path] = factory.split(".");
	return propertyAccessExpressionChain(luau.id(namespace), path);
}

export function getCreateFragmentIndex(state: TransformState) {
	assert(state.compilerOptions.jsxFragmentFactory);
	return getJsxIndex(state.compilerOptions.jsxFragmentFactory);
}

export function getCreateElementIndex(state: TransformState) {
	assert(state.compilerOptions.jsxFactory);
	return getJsxIndex(state.compilerOptions.jsxFactory);
}
