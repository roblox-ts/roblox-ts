import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { getAttributeNameText } from "TSTransformer/util/jsx/getAttributeName";
import ts from "typescript";

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
			DiagnosticService.addDiagnostic(errors.noPrivateIdentifier(node.name));
		}
		return luau.property(convertToIndexableExpression(transformExpression(state, node.expression)), node.name.text);
	} else if (ts.isJsxNamespacedName(node)) {
		return luau.string(getAttributeNameText(node));
	} else {
		return transformExpression(state, node);
	}
}

export function transformJsxTagName(state: TransformState, tagName: ts.JsxTagNameExpression) {
	const [expression, prereqs] = state.capture(() => transformJsxTagNameExpression(state, tagName));
	let tagNameExp = expression;
	if (!luau.list.isEmpty(prereqs)) {
		state.prereqList(prereqs);
		tagNameExp = state.pushToVarIfComplex(tagNameExp, "tagName");
	}
	return tagNameExp;
}
