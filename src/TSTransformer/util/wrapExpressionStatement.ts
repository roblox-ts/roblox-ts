import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer/classes/TransformState";
import { expressionMightMutate } from "TSTransformer/util/expressionMightMutate";
import ts from "typescript";

export function wrapExpressionStatement(
	state: TransformState,
	expression: luau.Expression,
	hasPrereqs = false,
	node?: ts.Expression,
) {
	const result = luau.list.make<luau.Statement>();
	if (luau.isCall(expression)) {
		luau.list.push(result, luau.create(luau.SyntaxKind.CallStatement, { expression: expression }));
	} else if (luau.isTemporaryIdentifier(expression) || luau.isNone(expression)) {
		// Compiler-generated remnant, can safely ignore
	} else if (hasPrereqs && !expressionMightMutate(state, expression, node)) {
		// No side effects, can safely remove
		// Only skip if there are prereqs to avoid "vanishing" statements
		return luau.list.make<luau.Statement>();
	} else {
		luau.list.push(
			result,
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: luau.tempId(),
				right: expression,
			}),
		);
	}
	return result;
}
