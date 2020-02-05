import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformStatement } from "TSTransformer/nodes/statements/transformStatement";
import ts from "typescript";

export function transformStatementList(state: TransformState, statements: ReadonlyArray<ts.Statement>) {
	const result = lua.list.make<lua.Statement>();

	for (const statement of statements) {
		const prereqStatements = lua.list.make<lua.Statement>();

		state.prereqStatementsStack.push(prereqStatements);
		const transformedStatements = transformStatement(state, statement);
		state.prereqStatementsStack.pop();

		lua.list.pushList(result, prereqStatements);
		lua.list.pushList(result, transformedStatements);
	}

	return result;
}
