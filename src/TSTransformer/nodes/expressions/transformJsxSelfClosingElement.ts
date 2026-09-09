import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformJsx } from "TSTransformer/nodes/jsx/transformJsx";
import ts from "typescript";

export function transformJsxSelfClosingElement(
	state: TransformState,
	prereqs: Prereqs,
	node: ts.JsxSelfClosingElement,
) {
	return transformJsx(state, prereqs, node, node.tagName, node.attributes, []);
}
