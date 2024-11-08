import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformOptionalChain } from "TSTransformer/nodes/transformOptionalChain";
import { addIndexDiagnostics } from "TSTransformer/util/addIndexDiagnostics";
import { addOneIfArrayType } from "TSTransformer/util/addOneIfArrayType";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { getConstantValueLiteral } from "TSTransformer/util/getConstantValueLiteral";
import { offset } from "TSTransformer/util/offset";
import { skipUpwards } from "TSTransformer/util/traversal";
import { isDefinitelyType, isLuaTupleType, isStringType } from "TSTransformer/util/types";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";
import ts from "typescript";

export function transformElementAccessExpressionInner(
	state: TransformState,
	node: ts.ElementAccessExpression,
	expression: luau.Expression,
	argumentExpression: ts.Expression,
) {
	// a in a[b]
	validateNotAnyType(state, node.expression);
	// b in a[b]
	validateNotAnyType(state, node.argumentExpression);

	const expType = state.typeChecker.getNonOptionalType(state.getType(node.expression));
	addIndexDiagnostics(state, node, expType);

	const [index, prereqs] = state.capture(() => transformExpression(state, argumentExpression));

	if (!luau.list.isEmpty(prereqs)) {
		// hack because wrapReturnIfLuaTuple will not wrap this, but now we need to!
		if (isLuaTupleType(state)(expType)) {
			expression = luau.array([expression]);
		}

		expression = state.pushToVar(expression, "exp");
		state.prereqList(prereqs);
	}

	// LuaTuple<T> checks
	if (luau.isCall(expression) && isLuaTupleType(state)(expType)) {
		// wrap in select() if it isn't the first value
		if (!luau.isNumberLiteral(index) || Number(index.value) !== 0) {
			expression = luau.call(luau.globals.select, [offset(index, 1), expression]);
		}
		// parentheses to trim off the rest of the values
		return luau.create(luau.SyntaxKind.ParenthesizedExpression, { expression });
	}

	// String indexing
	if (isDefinitelyType(expType, isStringType)) {
		expression = state.pushToVarIfNonId(expression, "str");

		let n = index;
		if (!luau.isNumberLiteral(n)) {
			n = state.pushToVar(n, "index");
		}

		let condition = luau.binary(luau.call(luau.globals.utf8.len, [expression]), ">", n);
		if (!luau.isNumberLiteral(n) || Number(n.value) < 0) {
			// only check for the index if it's not known or invalid
			condition = luau.binary(luau.binary(n, ">=", luau.number(0)), "and", condition);
		}

		const code = state.pushToVar(undefined, "code");

		state.prereq(
			luau.create(luau.SyntaxKind.IfStatement, {
				condition,
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.Assignment, {
						left: code,
						operator: "=",
						right: luau.call(luau.globals.utf8.codepoint, [
							expression,
							luau.call(luau.globals.utf8.offset, [expression, offset(n, 1)]),
						]),
					}),
				),
				elseBody: luau.list.make(),
			}),
		);

		return luau.call(luau.globals.utf8.char, [code]);
	}

	if (ts.isDeleteExpression(skipUpwards(node).parent)) {
		state.prereq(
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: addOneIfArrayType(state, expType, index),
				}),
				operator: "=",
				right: luau.nil(),
			}),
		);
		return luau.none();
	}

	return luau.create(luau.SyntaxKind.ComputedIndexExpression, {
		expression: convertToIndexableExpression(expression),
		index: addOneIfArrayType(state, expType, index),
	});
}

export function transformElementAccessExpression(state: TransformState, node: ts.ElementAccessExpression) {
	const constantValue = getConstantValueLiteral(state, node);
	if (constantValue) {
		return constantValue;
	}

	return transformOptionalChain(state, node);
}
