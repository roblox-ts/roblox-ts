import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformJsxAttributes } from "TSTransformer/nodes/jsx/transformJsxAttributes";
import { transformJsxChildren } from "TSTransformer/nodes/jsx/transformJsxChildren";
import { transformJsxTagName } from "TSTransformer/nodes/jsx/transformJsxTagName";
import { transformEntityName } from "TSTransformer/nodes/transformEntityName";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { createMapPointer, MapPointer } from "TSTransformer/util/pointer";
import ts from "typescript";

export function transformJsx(
	state: TransformState,
	prereqs: Prereqs,
	node: ts.JsxElement | ts.JsxSelfClosingElement,
	tagName: ts.JsxTagNameExpression,
	attributes: ts.JsxAttributes,
	children: ReadonlyArray<ts.JsxChild>,
) {
	// jsxFactoryEntity seems to always be defined and will default to `React.createElement`
	const jsxFactoryEntity = state.resolver.getJsxFactoryEntity(node);
	assert(jsxFactoryEntity, "Expected jsxFactoryEntity to be defined");

	const createElementExpression = convertToIndexableExpression(transformEntityName(state, jsxFactoryEntity));

	const tagNameExp = transformJsxTagName(state, tagName);

	let attributesPtr: MapPointer | undefined;
	if (attributes.properties.length > 0) {
		attributesPtr = createMapPointer("attributes");
		transformJsxAttributes(state, prereqs, attributes, attributesPtr);
	}

	const transformedChildren = transformJsxChildren(state, prereqs, children);

	const args = [tagNameExp];

	if (attributesPtr) {
		args.push(attributesPtr.value);
	} else if (transformedChildren.length > 0) {
		args.push(luau.nil());
	}

	args.push(...transformedChildren);

	return luau.call(createElementExpression, args);
}
