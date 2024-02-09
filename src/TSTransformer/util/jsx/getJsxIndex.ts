import luau from "@roblox-ts/luau-ast";
import assert from "assert";
import { TransformState } from "TSTransformer/classes/TransformState";
import { propertyAccessExpressionChain } from "TSTransformer/util/expressionChain";

function getJsxIndex(factory: string) {
	const [namespace, ...path] = factory.split(".");
	return propertyAccessExpressionChain(luau.id(namespace), path);
}

export function getJsxCreateFragmentIndex(state: TransformState) {
	if (!state.compilerOptions.jsxFragmentFactory) {
		// TODO: diagnostic
		return luau.none();
	}
	return getJsxIndex(state.compilerOptions.jsxFragmentFactory);
}

export function getJsxCreateElementIndex(state: TransformState) {
	assert(state.compilerOptions.jsxFactory);
	if (!state.compilerOptions.jsxFactory) {
		// TODO: diagnostic
		return luau.none();
	}
	return getJsxIndex(state.compilerOptions.jsxFactory);
}
