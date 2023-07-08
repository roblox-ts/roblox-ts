import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformJsxChildren } from "TSTransformer/nodes/jsx/transformJsxChildren";
import { getCreateFragmentIndex } from "TSTransformer/util/jsx/getJsxIndex";
import { createMapPointer, createMixedTablePointer } from "TSTransformer/util/pointer";
import ts from "typescript";

export function transformJsxFragment(state: TransformState, node: ts.JsxFragment) {
	const childrenPtr = createMixedTablePointer("children");
	transformJsxChildren(state, node.children, createMapPointer("attributes"), childrenPtr);

	const args = new Array<luau.Expression>();
	if (luau.isAnyIdentifier(childrenPtr.value) || !luau.list.isEmpty(childrenPtr.value.fields)) {
		args.push(childrenPtr.value);
	}

	return luau.call(getCreateFragmentIndex(state), args);
}
