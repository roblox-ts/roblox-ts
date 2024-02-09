import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformJsxAttributes } from "TSTransformer/nodes/jsx/transformJsxAttributes";
import { transformJsxChildren } from "TSTransformer/nodes/jsx/transformJsxChildren";
import { transformJsxTagName } from "TSTransformer/nodes/jsx/transformJsxTagName";
import { getJsxCreateElementIndex } from "TSTransformer/util/jsx/getJsxIndex";
import { createMapPointer } from "TSTransformer/util/pointer";
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
	transformJsxAttributes(state, attributes, attributesPtr);

	return luau.call(getJsxCreateElementIndex(state), [
		tagNameExp,
		attributesPtr.value,
		...transformJsxChildren(state, children),
	]);
}
