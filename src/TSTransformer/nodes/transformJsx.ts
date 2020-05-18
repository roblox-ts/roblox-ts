import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { createMapPointer } from "TSTransformer/util/pointer";

function transformJsxTagName(state: TransformState, node: ts.JsxTagNameExpression) {
	if (ts.isPropertyAccessExpression(node)) {
		if (ts.isPrivateIdentifier(node.name)) {
			state.addDiagnostic(diagnostics.noPrivateIdentifier(node.name));
		}
		return lua.create(lua.SyntaxKind.PropertyAccessExpression, {
			expression: convertToIndexableExpression(transformExpression(state, node.expression)),
			name: node.name.text,
		});
	} else {
		return transformExpression(state, node);
	}
}

function transformAttributes(state: TransformState, attributes: ts.JsxAttributes) {}

export function transformJsx(
	state: TransformState,
	tagName: ts.JsxTagNameExpression,
	attributes: ts.JsxAttributes,
	children: ReadonlyArray<ts.JsxChild>,
) {
	const tagNameCaptures = state.capture(() => transformJsxTagName(state, tagName));
	let tagNameExp = tagNameCaptures.expression;
	if (!lua.list.isEmpty(tagNameCaptures.statements)) {
		tagNameExp = state.pushToVarIfComplex(tagNameExp);
	}
	assert(lua.isSimple(tagNameExp));

	const attributesPtr = createMapPointer();
	const childrenPtr = createMapPointer();

	for (const attribute of attributes.properties) {
		if (ts.isJsxAttribute(attribute)) {
			attribute.name; // ts.Identifier
			attribute.initializer; // ts.JsxExpression | ts.StringLiteral | undefined
		} else {
			attribute.expression; // ts.Expression
		}
	}

	for (const child of children) {
		if (ts.isJsxText(child)) {
			if (!child.containsOnlyTriviaWhiteSpaces) {
				state.addDiagnostic(diagnostics.noJsxText(child));
			}
			continue;
		}

		// not available when jsxFactory is set
		assert(!ts.isJsxFragment(child));

		if (ts.isJsxExpression(child)) {
			child.dotDotDotToken; // ts.Token<ts.SyntaxKind.DotDotDotToken> | undefined
			child.expression; // ts.Expression | undefined
		} else {
			child; // ts.JsxElement | ts.JsxSelfClosingElement
		}
	}
}
