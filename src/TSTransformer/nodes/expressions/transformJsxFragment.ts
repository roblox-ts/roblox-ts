import ts from "typescript";
import { TransformState } from "TSTransformer";
import { transformJsxFragmentShorthand } from "TSTransformer/nodes/jsx/transformJsx";

export function transformJsxFragment(state: TransformState, node: ts.JsxFragment) {
	return transformJsxFragmentShorthand(state, node.children);
}
