import { TransformState } from "TSTransformer";
import ts from "typescript";
import * as lua from "LuaAST";
import { transformStatement } from "TSTransformer/nodes/statements/statement";

export function transformStatementList(state: TransformState, statements: ReadonlyArray<ts.Statement>) {
	const result = lua.list.make<lua.Statement>();

	for (const statement of statements) {
		const prereqStatements = lua.list.make<lua.Statement>();

		state.prereqStatementsStack.push(prereqStatements);
		const transformedStatements = transformStatement(state, statement);
		state.prereqStatementsStack.pop();

		lua.list.forEach(prereqStatements, s => lua.list.push(result, s));
		lua.list.forEach(transformedStatements, s => lua.list.push(result, s));
	}

	return result;
}
