import { assert } from "console";
import { KEY_ATTRIBUTE_NAME } from "TSTransformer/util/jsx/constants";
import { getAttributes } from "TSTransformer/util/jsx/getAttributes";
import ts from "typescript";

export function getKeyAttributeInitializer(element: ts.JsxElement | ts.JsxSelfClosingElement) {
	for (const attribute of getAttributes(element).properties) {
		if (ts.isJsxAttribute(attribute) && attribute.name.text === KEY_ATTRIBUTE_NAME && attribute.initializer) {
			if (ts.isStringLiteral(attribute.initializer)) {
				return attribute.initializer;
			} else if (ts.isJsxExpression(attribute.initializer)) {
				return attribute.initializer.expression;
			} else {
				assert(false, `Unexpected JSX attribute initializer type!`);
			}
		}
	}
}
