import { getDeclaredVariables } from "TSTransformer/util/getDeclaredVariables";
import ts from "typescript";

it("collects names from a declaration and a declaration list without initializer references", () => {
	const source = ts.createSourceFile(
		"bindings.ts",
		"const { original: renamed, nested: [first, , ...rest] } = input, [second] = other;",
		ts.ScriptTarget.Latest,
		true,
	);
	const statement = source.statements[0];
	if (!ts.isVariableStatement(statement)) {
		throw new Error("Expected a variable statement");
	}
	const declarations = statement.declarationList;

	expect(getDeclaredVariables(declarations).map(identifier => identifier.text)).toEqual([
		"renamed",
		"first",
		"rest",
		"second",
	]);
	expect(getDeclaredVariables(declarations.declarations[0]).map(identifier => identifier.text)).toEqual([
		"renamed",
		"first",
		"rest",
	]);
});
