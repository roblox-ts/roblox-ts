import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformJsxChildren } from "TSTransformer/nodes/jsx/transformJsxChildren";
import { createRoactIndex } from "TSTransformer/util/jsx/createRoactIndex";
import { createMapPointer, createMixedTablePointer } from "TSTransformer/util/pointer";
import ts from "typescript";

export function transformJsxFragment(state: TransformState, node: ts.JsxFragment) {
	if (!state.isRoactJsxFragmentFactory(node)) return luau.nil();

	const childrenPtr = createMixedTablePointer("children");
	transformJsxChildren(state, node.children, createMapPointer("attributes"), childrenPtr);

	const args = new Array<luau.Expression>();
	if (luau.isAnyIdentifier(childrenPtr.value) || !luau.list.isEmpty(childrenPtr.value.fields)) {
		args.push(childrenPtr.value);
	}

	return luau.call(createRoactIndex("createFragment"), args);
}
