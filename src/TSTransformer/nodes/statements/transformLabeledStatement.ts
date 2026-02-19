import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer/classes/TransformState";
import { transformStatement } from "TSTransformer/nodes/statements/transformStatement";
import ts from "typescript";

export function transformLabeledStatement(state: TransformState, node: ts.LabeledStatement) {
	const id = state.pushLabelToLoopStack(node);
	state.prereq(
		luau.create(luau.SyntaxKind.VariableDeclaration, {
			left: id,
			right: undefined,
		}),
	);

	const statements = transformStatement(state, node.statement);
	state.popLoopLabelStack();

	return statements;
}
