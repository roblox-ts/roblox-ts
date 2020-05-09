import ts from "byots";

export function getStatements(statement: ts.Statement): ReadonlyArray<ts.Statement> {
	return ts.isBlock(statement) ? statement.statements : [statement];
}
