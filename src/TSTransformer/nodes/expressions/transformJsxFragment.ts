import { TransformState } from "TSTransformer";
import { transformJsxFragmentShorthand } from "TSTransformer/nodes/jsx/transformJsx";
import ts from "typescript";

export function transformJsxFragment(state: TransformState, node: ts.JsxFragment) {
	return transformJsxFragmentShorthand(state, node.children);
}
