import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformStatement } from "TSTransformer/nodes/statements/transformStatement";
import { createHoistDeclaration } from "TSTransformer/util/createHoistDeclaration";

export function transformStatementList(state: TransformState, statements: ReadonlyArray<ts.Statement>) {
	const result = lua.list.make<lua.Statement>();

	for (const statement of statements) {
		let transformedStatements!: lua.List<lua.Statement>;
		const prereqStatements = state.statement(() => (transformedStatements = transformStatement(state, statement)));

		// comments
		for (const comment of state.getLeadingComments(statement)) {
			lua.list.push(result, lua.comment(comment));
		}

		const hoistDeclaration = createHoistDeclaration(state, statement);
		if (hoistDeclaration) {
			lua.list.push(result, hoistDeclaration);
		}

		lua.list.pushList(result, prereqStatements);
		lua.list.pushList(result, transformedStatements);

		const lastStatement = transformedStatements.tail?.value;
		if (lastStatement && lua.isFinalStatement(lastStatement)) {
			break;
		}
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
