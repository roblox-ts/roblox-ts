import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import ts from "typescript";

function transformJsxTagNameExpression(state: TransformState, prereqs: Prereqs, node: ts.JsxTagNameExpression) {
	// host component
	if (ts.isIdentifier(node)) {
		const firstChar = node.text[0];
		if (firstChar === firstChar.toLowerCase()) {
			return luau.string(node.text);
		}
	}

	if (ts.isPropertyAccessExpression(node)) {
		if (ts.isPrivateIdentifier(node.name)) {
			DiagnosticService.addDiagnostic(errors.noPrivateIdentifier(node.name));
		}
		return luau.property(
			convertToIndexableExpression(transformExpression(state, prereqs, node.expression)),
			node.name.text,
		);
	} else if (ts.isJsxNamespacedName(node)) {
		return luau.string(ts.getTextOfJsxNamespacedName(node));
	} else {
		return transformExpression(state, prereqs, node);
	}
}

export function transformJsxTagName(state: TransformState, prereqs: Prereqs, tagName: ts.JsxTagNameExpression) {
	const expressionPrereqs = new Prereqs();
	const expression = transformJsxTagNameExpression(state, expressionPrereqs, tagName);
	let tagNameExp = expression;
	if (!luau.list.isEmpty(expressionPrereqs.statements)) {
		prereqs.prereqList(expressionPrereqs.statements);
		tagNameExp = prereqs.pushToVarIfComplex(tagNameExp, "tagName");
	}
	return tagNameExp;
}
