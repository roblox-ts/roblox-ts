import ts from "byots";
import luau from "LuauAST";
import { diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";

function transformJsxTagNameExpression(state: TransformState, node: ts.JsxTagNameExpression) {
	if (ts.isIdentifier(node)) {
		const symbol = state.typeChecker.getSymbolAtLocation(node);
		if (symbol) {
			assert(state.services.roactSymbolManager);
			const className = state.services.roactSymbolManager.getIntrinsicElementClassNameFromSymbol(symbol);
			if (className !== undefined) {
				return luau.string(className);
			}
		}
	}

	if (ts.isPropertyAccessExpression(node)) {
		if (ts.isPrivateIdentifier(node.name)) {
			state.addDiagnostic(diagnostics.noPrivateIdentifier(node.name));
		}
		return luau.create(luau.SyntaxKind.PropertyAccessExpression, {
			expression: convertToIndexableExpression(transformExpression(state, node.expression)),
			name: node.name.text,
		});
	} else {
		return transformExpression(state, node);
	}
}

export function transformJsxTagName(state: TransformState, tagName: ts.JsxTagNameExpression) {
	const [expression, prereqs] = state.capture(() => transformJsxTagNameExpression(state, tagName));
	let tagNameExp = expression;
	if (!luau.list.isEmpty(prereqs)) {
		state.prereqList(prereqs);
		tagNameExp = state.pushToVarIfComplex(tagNameExp);
	}
	return tagNameExp;
}
