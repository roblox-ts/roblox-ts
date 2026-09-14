import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformJsx } from "TSTransformer/nodes/jsx/transformJsx";
import ts from "typescript";

export function transformJsxElement(state: TransformState, prereqs: Prereqs, node: ts.JsxElement) {
	return transformJsx(
		state,
		prereqs,
		node,
		node.openingElement.tagName,
		node.openingElement.attributes,
		node.children,
	);
}
