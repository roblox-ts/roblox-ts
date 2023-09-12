import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformJsxAttributes } from "TSTransformer/nodes/jsx/transformJsxAttributes";
import { transformJsxChildren } from "TSTransformer/nodes/jsx/transformJsxChildren";
import { transformJsxTagName } from "TSTransformer/nodes/jsx/transformJsxTagName";
import { getCreateElementIndex } from "TSTransformer/util/jsx/getJsxIndex";
import { createMapPointer, createMixedTablePointer } from "TSTransformer/util/pointer";
import ts from "typescript";

export function transformJsx(
	state: TransformState,
	node: ts.JsxElement | ts.JsxSelfClosingElement,
	tagName: ts.JsxTagNameExpression,
	attributes: ts.JsxAttributes,
	children: ReadonlyArray<ts.JsxChild>,
) {
	const tagNameExp = transformJsxTagName(state, tagName);
	const attributesPtr = createMapPointer("attributes");
	const childrenPtr = createMixedTablePointer("children");
	transformJsxAttributes(state, attributes, attributesPtr);
	transformJsxChildren(state, children, attributesPtr, childrenPtr);

	const args = [tagNameExp];
	const pushAttributes = luau.isAnyIdentifier(attributesPtr.value) || !luau.list.isEmpty(attributesPtr.value.fields);
	const pushChildren = luau.isAnyIdentifier(childrenPtr.value) || !luau.list.isEmpty(childrenPtr.value.fields);
	if (pushAttributes || pushChildren) {
		args.push(attributesPtr.value);
	}
	if (pushChildren) {
		args.push(childrenPtr.value);
	}

	return luau.call(getCreateElementIndex(state), args);
}
