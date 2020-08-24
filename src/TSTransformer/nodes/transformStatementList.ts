import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { transformStatement } from "TSTransformer/nodes/statements/transformStatement";
import { createHoistDeclaration } from "TSTransformer/util/createHoistDeclaration";

/**
 * Convert a ts.Statement array into a luau.list<...> tree
 * @param state The current state of the transformation.
 * @param statements The statements to transform into a `luau.list<...>`.
 * @param exportInfo Information about exporting.
 */
export function transformStatementList(
	state: TransformState,
	statements: ReadonlyArray<ts.Statement>,
	exportInfo?: {
		id: luau.AnyIdentifier;
		mapping: Map<ts.Statement, Array<string>>;
	},
) {
	// make a new Luau tree
	const result = luau.list.make<luau.Statement>();

	// iterate through each statement in the `statements` array
	for (const statement of statements) {
		let transformedStatements!: luau.List<luau.Statement>;
		// capture prerequisite statements for the `ts.Statement`
		// transform the statement into a luau.List<...>
		const prereqStatements = state.capturePrereqs(
			() => (transformedStatements = transformStatement(state, statement)),
		);

		// iterate through each of the leading comments of the statement
		if (state.compilerOptions.removeComments !== true) {
			luau.list.pushList(result, state.getLeadingComments(statement));
		}

		// check statement for hoisting
		// hoisting is the use of a variable before it was declared
		const hoistDeclaration = createHoistDeclaration(state, statement);
		if (hoistDeclaration) {
			luau.list.push(result, hoistDeclaration);
		}

		luau.list.pushList(result, prereqStatements);
		luau.list.pushList(result, transformedStatements);

		const lastStatement = transformedStatements.tail?.value;
		if (lastStatement && luau.isFinalStatement(lastStatement)) {
			break;
		}

		// namespace export handling
		if (exportInfo) {
			const containerId = exportInfo.id;
			const exportMapping = exportInfo.mapping.get(statement);
			if (exportMapping !== undefined) {
				for (const exportName of exportMapping) {
					luau.list.push(
						result,
						luau.create(luau.SyntaxKind.Assignment, {
							left: luau.create(luau.SyntaxKind.PropertyAccessExpression, {
								expression: containerId,
								name: exportName,
							}),
							operator: "=",
							right: luau.id(exportName),
						}),
					);
				}
			}
		}
	}

	if (state.compilerOptions.removeComments !== true && statements.length > 0) {
		const lastParentToken = statements[statements.length - 1].parent.getLastToken();
		if (lastParentToken) {
			luau.list.pushList(result, state.getLeadingComments(lastParentToken));
		}
	}

	return result;
}
