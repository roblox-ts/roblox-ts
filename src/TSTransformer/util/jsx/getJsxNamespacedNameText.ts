import ts from "typescript";

export function getJsxNamespacedNameText(node: ts.JsxNamespacedName) {
	return `${node.namespace.text}:${node.name.text}`;
}
