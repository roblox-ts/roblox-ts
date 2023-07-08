import luau from "@roblox-ts/luau-ast";
import assert from "assert";
import { TransformState } from "TSTransformer/classes/TransformState";

function getJsxIndex(factory: string) {
	const [namespace, index] = factory.split(".");
	return luau.property(luau.id(namespace), index);
}

export function getCreateFragmentIndex(state: TransformState) {
	assert(state.compilerOptions.jsxFragmentFactory);
	return getJsxIndex(state.compilerOptions.jsxFragmentFactory);
}

export function getCreateElementIndex(state: TransformState) {
	assert(state.compilerOptions.jsxFactory);
	return getJsxIndex(state.compilerOptions.jsxFactory);
}
