import ts from "typescript";
import { TransformState } from "TSTransformer";
import { transformJsx } from "TSTransformer/nodes/jsx/transformJsx";

export function transformJsxSelfClosingElement(state: TransformState, node: ts.JsxSelfClosingElement) {
	return transformJsx(state, node, node.tagName, node.attributes, []);
}
