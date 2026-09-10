import luau, { renderAST } from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformWritableAssignment } from "TSTransformer/nodes/transformWritable";
import { getDeclaredVariables } from "TSTransformer/util/getDeclaredVariables";
import ts from "typescript";

import { createTransformState } from "./createTransformState";

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

it("preserves the assignment target without reading its old value when read flags are omitted", () => {
	const state = createTransformState(`
		let target = { value: 0 };
		function replace() { target = { value: 2 }; return 1; }
		target.value = replace();
	`);
	const source = state.program.getSourceFile("/src/playground.tsx");
	assert(source);
	const statement = source.statements[2];
	assert(ts.isExpressionStatement(statement) && ts.isBinaryExpression(statement.expression));
	const { left, right } = statement.expression;
	const prereqs = new Prereqs();

	const { writable, readable, value } = transformWritableAssignment(state, prereqs, left, right);
	prereqs.push(luau.create(luau.SyntaxKind.Assignment, { left: writable, operator: "=", right: value }));

	expect(readable).toBe(writable);
	expect(renderAST(prereqs.statements)).toBe("local _exp = target\n_exp.value = replace()\n");
});
