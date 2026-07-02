import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { getLabelsOfStatement } from "TSTransformer/util/getLabelsOfStatement";
import ts from "typescript";

export function transformBlock(state: TransformState, node: ts.Block) {
	if (getLabelsOfStatement(node).length === 0) {
		return luau.list.make(
			luau.create(luau.SyntaxKind.DoStatement, {
				statements: transformStatementList(state, node, node.statements),
			}),
		);
	}

	// A labeled block (e.g. `a: { ...; break a; }`) is emulated with `repeat ... until true` so that
	// `break <label>` can exit it, reusing the loop label machinery.
	state.increaseLoopDepth();

	const statements = transformStatementList(state, node, node.statements);
	luau.list.unshiftList(statements, state.processLoopLabel(node));

	const result = luau.list.make<luau.Statement>(
		luau.create(luau.SyntaxKind.RepeatStatement, {
			statements,
			condition: luau.bool(true),
		}),
	);
	luau.list.pushList(result, state.generateLabelChecks());

	state.decreaseLoopDepth();

	return result;
}
