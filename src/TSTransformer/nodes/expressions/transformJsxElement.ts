import ts from "byots";
import { TransformState } from "TSTransformer";
import { transformJsx } from "TSTransformer/nodes/transformJsx";

export function transformJsxElement(state: TransformState, node: ts.JsxElement) {
	return transformJsx(state, node, node.openingElement.tagName, node.openingElement.attributes, node.children);
}
