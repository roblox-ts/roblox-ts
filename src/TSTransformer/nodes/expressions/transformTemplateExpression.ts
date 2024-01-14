import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { createStringFromLiteral } from "TSTransformer/util/createStringFromLiteral";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { isDefinitelyType, isLuaTupleType } from "TSTransformer/util/types";
import ts from "typescript";

export function transformTemplateExpression(
	state: TransformState,
	node: ts.TemplateExpression | ts.NoSubstitutionTemplateLiteral,
) {
	// backtick string literals without interpolation expressions should be preserved
	// as they still are valid in luau
	if (ts.isNoSubstitutionTemplateLiteral(node)) {
		return luau.create(luau.SyntaxKind.InterpolatedString, {
			segments: luau.list.make(createStringFromLiteral(node)),
		});
	}

	const segments = luau.list.make<luau.Expression>();

	if (node.head.text.length > 0) {
		luau.list.push(segments, createStringFromLiteral(node.head));
	}

	const orderedExpressions = ensureTransformOrder(
		state,
		node.templateSpans.map(templateSpan => templateSpan.expression),
	);

	for (let i = 0; i < node.templateSpans.length; i++) {
		const templateSpan = node.templateSpans[i];
		const expression = orderedExpressions[i];
		const type = state.getType(templateSpan.expression);
		if (isDefinitelyType(type, isLuaTupleType(state))) {
			DiagnosticService.addDiagnostic(errors.noLuaTupleInTemplateExpression(templateSpan.expression));
		}
		luau.list.push(segments, expression);

		if (templateSpan.literal.text.length > 0) {
			luau.list.push(segments, createStringFromLiteral(templateSpan.literal));
		}
	}

	return luau.create(luau.SyntaxKind.InterpolatedString, { segments });
}
