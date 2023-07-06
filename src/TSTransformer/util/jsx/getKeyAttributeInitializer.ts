import { KEY_ATTRIBUTE_NAME } from "TSTransformer/util/jsx/constants";
import { getAttributeNameText } from "TSTransformer/util/jsx/getAttributeName";
import { getAttributes } from "TSTransformer/util/jsx/getAttributes";
import ts from "typescript";

export function getKeyAttributeInitializer(element: ts.JsxElement | ts.JsxSelfClosingElement) {
	for (const attribute of getAttributes(element).properties) {
		if (
			ts.isJsxAttribute(attribute) &&
			getAttributeNameText(attribute.name) === KEY_ATTRIBUTE_NAME &&
			attribute.initializer
		) {
			if (ts.isStringLiteral(attribute.initializer)) {
				return attribute.initializer;
			} else if (ts.isJsxExpression(attribute.initializer)) {
				return attribute.initializer.expression;
			}
			// embedded JSX elements are ignored because "Key" type doesn't support them by default
		}
	}
}
