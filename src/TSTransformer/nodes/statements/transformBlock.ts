import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";

export function transformBlock(state: TransformState, node: ts.Block) {
	return luau.list.make(
		luau.create(luau.SyntaxKind.DoStatement, {
			statements: transformStatementList(state, node.statements),
		}),
	);
}
