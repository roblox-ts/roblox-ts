import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformJsxAttributes } from "TSTransformer/nodes/jsx/transformJsxAttributes";
import { transformJsxChildren } from "TSTransformer/nodes/jsx/transformJsxChildren";
import { transformJsxTagName } from "TSTransformer/nodes/jsx/transformJsxTagName";
import { transformEntityName } from "TSTransformer/nodes/transformEntityName";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
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

	// jsxFactoryEntity seems to always be defined and will default to `React.createElement`
	const jsxFactoryEntity = state.resolver.getJsxFactoryEntity(node);
	assert(jsxFactoryEntity, "Expected jsxFactoryEntity to be defined");

	return luau.call(convertToIndexableExpression(transformEntityName(state, jsxFactoryEntity)), [
		tagNameExp,
		attributesPtr.value,
		...transformJsxChildren(state, children),
	]);
}
