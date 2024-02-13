import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformOptionalChain } from "TSTransformer/nodes/transformOptionalChain";
import { addIndexDiagnostics } from "TSTransformer/util/addIndexDiagnostics";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { getConstantValueLiteral } from "TSTransformer/util/getConstantValueLiteral";
import { skipUpwards } from "TSTransformer/util/traversal";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";
import ts from "typescript";

export function transformPropertyAccessExpressionInner(
	state: TransformState,
	node: ts.PropertyAccessExpression,
	expression: luau.Expression,
	name: string,
) {
	// a in a.b
	validateNotAnyType(state, node.expression);

	addIndexDiagnostics(state, node, state.typeChecker.getNonOptionalType(state.getType(node)));

	if (ts.isDeleteExpression(skipUpwards(node).parent)) {
		state.prereq(
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.property(convertToIndexableExpression(expression), name),
				operator: "=",
				right: luau.nil(),
			}),
		);
		return luau.none();
	}

	return luau.property(convertToIndexableExpression(expression), name);
}

export function transformPropertyAccessExpression(state: TransformState, node: ts.PropertyAccessExpression) {
	if (ts.isSuperProperty(node)) {
		DiagnosticService.addDiagnostic(errors.noSuperProperty(node));
	}

	const constantValue = getConstantValueLiteral(state, node);
	if (constantValue) {
		return constantValue;
	}

	return transformOptionalChain(state, node);
}
