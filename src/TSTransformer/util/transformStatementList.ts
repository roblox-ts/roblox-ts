import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformStatement } from "TSTransformer/nodes/statements/transformStatement";
import ts from "typescript";

export function transformStatementList(state: TransformState, statements: ReadonlyArray<ts.Statement>) {
	const result = lua.list.make<lua.Statement>();

	for (const statement of statements) {
		let transformedStatements!: lua.List<lua.Statement>;
		const prereqStatements = state.statement(() => (transformedStatements = transformStatement(state, statement)));
		for (const comment of state.getLeadingComments(statement)) {
			lua.list.push(result, lua.comment(comment));
		}
		lua.list.pushList(result, prereqStatements);
		lua.list.pushList(result, transformedStatements);
	}

	if (statements.length > 0) {
		const lastParentToken = statements[statements.length - 1].parent.getLastToken();
		if (lastParentToken) {
			for (const comment of state.getLeadingComments(lastParentToken)) {
				lua.list.push(result, lua.comment(comment));
			}
		}
	}

	return result;
}
