import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformLogical } from "TSTransformer/nodes/transformLogical";
import { createBinaryFromOperator } from "TSTransformer/util/createBinaryFromOperator";
import { expressionMightMutate } from "TSTransformer/util/expressionMightMutate";
import { isUsedAsStatement } from "TSTransformer/util/isUsedAsStatement";
import { isBooleanLiteralType } from "TSTransformer/util/types";
import { valueToIdStr } from "TSTransformer/util/valueToIdStr";
import ts from "typescript";

import { createTransformState } from "./createTransformState";

it.each([
	["object.value;", true],
	["(object.value);", true],
	["const result = object.value;", false],
	["for (object.value; ; ) {}", true],
	["for (; object.value; ) {}", false],
	["for (; ; object.value) {}", true],
	["delete object.value;", true],
	["const result = delete object.value;", false],
])("identifies whether %s discards its value", (source, expected) => {
	const sourceFile = ts.createSourceFile("test.ts", source, ts.ScriptTarget.Latest, true);
	const expressions = new Array<ts.PropertyAccessExpression>();
	function visit(node: ts.Node) {
		if (ts.isPropertyAccessExpression(node)) {
			expressions.push(node);
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);

	expect(expressions).toHaveLength(1);
	expect(isUsedAsStatement(expressions[0])).toBe(expected);
});

it.each([
	["identifier", luau.id("Players"), "players"],
	["property", luau.property(luau.id("services"), "Players"), "players"],
	["constructor", luau.call(luau.property(luau.id("Widget"), "new")), "widget"],
	["namespaced constructor", luau.call(luau.property(luau.property(luau.id("UI"), "Widget"), "new")), "widget"],
	["computed constructor", luau.call(luau.property(luau.call(luau.id("getClass")), "new")), ""],
	["ordinary function", luau.call(luau.id("getValue")), ""],
	["ordinary method", luau.call(luau.property(luau.id("Widget"), "create")), ""],
	["literal", luau.number(1), ""],
])("derives a readable temporary name for a %s", (name, expression, expected) => {
	expect(valueToIdStr(expression)).toBe(expected);
});

it("recognizes stable varargs and checks both operands of binary expressions", () => {
	const state = createTransformState();
	expect(expressionMightMutate(state, luau.create(luau.SyntaxKind.VarArgsLiteral, {}))).toBe(false);
	expect(expressionMightMutate(state, luau.binary(luau.number(1), "+", luau.number(2)))).toBe(false);
	expect(expressionMightMutate(state, luau.binary(luau.number(1), "+", luau.call(luau.id("read"))))).toBe(true);
});

it("distinguishes both boolean literals through the checker", () => {
	const state = createTransformState();
	const isTrue = isBooleanLiteralType(state, true);
	const isFalse = isBooleanLiteralType(state, false);
	expect(isTrue(state.typeChecker.getTrueType())).toBe(true);
	expect(isTrue(state.typeChecker.getFalseType())).toBe(false);
	expect(isFalse(state.typeChecker.getFalseType())).toBe(true);
	expect(isFalse(state.typeChecker.getTrueType())).toBe(false);
});

it("rejects binary operators that require a dedicated transform", () => {
	const state = createTransformState();
	const numberType = state.typeChecker.getNumberType();
	expect(() =>
		createBinaryFromOperator(
			new Prereqs(),
			luau.number(1),
			numberType,
			ts.SyntaxKind.EqualsEqualsToken,
			luau.number(2),
			numberType,
		),
	).toThrow("createBinaryFromOperator unknown operator: EqualsEqualsToken");
});

it("rejects arithmetic expressions in logical lowering", () => {
	const state = createTransformState("export const value = 1 + 2;");
	const source = state.program.getSourceFile("/src/playground.tsx");
	assert(source);
	const statement = source.statements[0];
	assert(ts.isVariableStatement(statement));
	const expression = statement.declarationList.declarations[0].initializer;
	assert(expression && ts.isBinaryExpression(expression));

	expect(() => transformLogical(state, new Prereqs(), expression)).toThrow("Operator not implemented: PlusToken");
});
