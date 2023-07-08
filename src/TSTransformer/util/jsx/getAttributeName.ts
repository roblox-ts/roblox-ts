import ts from "typescript";

export function getAttributeNameText(node: ts.JsxAttributeName) {
	if (ts.isIdentifier(node)) {
		return node.text;
	} else {
		return `${node.namespace.text}:${node.name.text}`;
	}
}
