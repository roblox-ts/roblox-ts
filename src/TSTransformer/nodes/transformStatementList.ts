import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformStatement } from "TSTransformer/nodes/statements/transformStatement";
import { createHoistDeclaration } from "TSTransformer/util/createHoistDeclaration";

export function transformStatementList(
	state: TransformState,
	statements: ReadonlyArray<ts.Statement>,
	exportInfo?: {
		id: lua.AnyIdentifier;
		mapping: Map<ts.Statement, Array<string>>;
	},
) {
	const result = lua.list.make<lua.Statement>();

	for (const statement of statements) {
		let transformedStatements!: lua.List<lua.Statement>;
		const prereqStatements = state.capturePrereqs(
			() => (transformedStatements = transformStatement(state, statement)),
		);

		// comments
		for (const comment of state.getLeadingComments(statement)) {
			lua.list.push(
				result,
				lua.create(lua.SyntaxKind.Comment, {
					text: comment,
				}),
			);
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

		// namespace export handling
		if (exportInfo) {
			const containerId = exportInfo.id;
			const exportMapping = exportInfo.mapping.get(statement);
			if (exportMapping !== undefined) {
				for (const exportName of exportMapping) {
					lua.list.push(
						result,
						lua.create(lua.SyntaxKind.Assignment, {
							left: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
								expression: containerId,
								name: exportName,
							}),
							right: lua.id(exportName),
						}),
					);
				}
			}
		}
	}

	if (statements.length > 0) {
		const lastParentToken = statements[statements.length - 1].parent.getLastToken();
		if (lastParentToken) {
			for (const comment of state.getLeadingComments(lastParentToken)) {
				lua.list.push(
					result,
					lua.create(lua.SyntaxKind.Comment, {
						text: comment,
					}),
				);
			}
		}
	}

	return result;
}
