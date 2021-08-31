import { TransformState } from "TSTransformer";
import { transformJsx } from "TSTransformer/nodes/jsx/transformJsx";
import ts from "typescript";

export function transformJsxSelfClosingElement(state: TransformState, node: ts.JsxSelfClosingElement) {
	return transformJsx(state, node, node.tagName, node.attributes, []);
}
