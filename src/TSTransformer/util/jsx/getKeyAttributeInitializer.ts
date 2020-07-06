import ts from "byots";
import { KEY_ATTRIBUTE_NAME } from "TSTransformer/util/jsx/constants";
import { getAttributes } from "TSTransformer/util/jsx/getAttributes";

export function getKeyAttributeInitializer(element: ts.JsxElement | ts.JsxSelfClosingElement) {
	for (const attribute of getAttributes(element).properties) {
		if (ts.isJsxAttribute(attribute) && attribute.name.text === KEY_ATTRIBUTE_NAME && attribute.initializer) {
			if (ts.isStringLiteral(attribute.initializer)) {
				return attribute.initializer;
			} else {
				return attribute.initializer.expression;
			}
		}
	}
}
