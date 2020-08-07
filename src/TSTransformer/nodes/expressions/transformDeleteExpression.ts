import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { diagnostics } from "Shared/diagnostics";

export function transformDeleteExpression(state: TransformState, node: ts.DeleteExpression) {
	const expression = transformExpression(state, node.expression);
	if (luau.isWritableExpression(expression) && !luau.isAnyIdentifier(expression)) {
		state.prereq(
			luau.create(luau.SyntaxKind.Assignment, {
				left: expression,
				operator: "=",
				right: luau.nil(),
			}),
		);
	} else {
		// Usually optional chain, e.g. `delete a.b?.c`
		state.addDiagnostic(diagnostics.noComplexDelete(node));
	}
	return luau.bool(true);
}
