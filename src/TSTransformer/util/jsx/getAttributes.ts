import ts from "typescript";

export function getAttributes(node: ts.JsxElement | ts.JsxSelfClosingElement) {
	if (ts.isJsxElement(node)) {
		return node.openingElement.attributes;
	} else {
		return node.attributes;
	}
}
