import ts from "byots";
import { TransformState } from "TSTransformer";
import { transformJsx } from "TSTransformer/nodes/transformJsx";

export function transformJsxSelfClosingElement(state: TransformState, node: ts.JsxSelfClosingElement) {
	return transformJsx(state, node.attributes, []);
}
