import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformJsxChildren } from "TSTransformer/nodes/jsx/transformJsxChildren";
import { getJsxCreateElementIndex, getJsxCreateFragmentIndex } from "TSTransformer/util/jsx/getJsxIndex";
import ts from "typescript";

export function transformJsxFragment(state: TransformState, node: ts.JsxFragment) {
	return luau.call(getJsxCreateElementIndex(state), [
		getJsxCreateFragmentIndex(state),
		luau.map(),
		...transformJsxChildren(state, node.children),
	]);
}
