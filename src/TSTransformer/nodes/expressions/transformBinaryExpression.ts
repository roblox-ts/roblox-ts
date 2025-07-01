import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformArrayAssignmentPattern } from "TSTransformer/nodes/binding/transformArrayAssignmentPattern";
import { transformObjectAssignmentPattern } from "TSTransformer/nodes/binding/transformObjectAssignmentPattern";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { transformLogical } from "TSTransformer/nodes/transformLogical";
import { transformLogicalOrCoalescingAssignmentExpression } from "TSTransformer/nodes/transformLogicalOrCoalescingAssignmentExpression";
import { transformWritableAssignment, transformWritableExpression } from "TSTransformer/nodes/transformWritable";
import { arrayLikeExpressionContainsSpread } from "TSTransformer/util/arrayLikeExpressionContainsSpread";
import {
	createAssignmentExpression,
	createCompoundAssignmentExpression,
	getSimpleAssignmentOperator,
} from "TSTransformer/util/assignment";
import { createBitwiseFromOperator, isBitwiseOperator } from "TSTransformer/util/bitwise";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { createBinaryFromOperator } from "TSTransformer/util/createBinaryFromOperator";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { getAssignableValue } from "TSTransformer/util/getAssignableValue";
import { getKindName } from "TSTransformer/util/getKindName";
import { isUsedAsStatement } from "TSTransformer/util/isUsedAsStatement";
import { skipDownwards } from "TSTransformer/util/traversal";
import {
	isDefinitelyType,
	isLuaTupleType,
	isNumberType,
	isPossiblyType,
	isRobloxType,
	isStringType,
} from "TSTransformer/util/types";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";
import ts from "typescript";

function transformOptimizedArrayAssignmentPattern(
	state: TransformState,
	assignmentPattern: ts.ArrayLiteralExpression,
	rhs: luau.Expression | luau.List<luau.Expression>,
) {
	const variables = luau.list.make<luau.TemporaryIdentifier>();
	const writes = luau.list.make<luau.WritableExpression>();
	const writesPrereqs = luau.list.make<luau.Statement>();
	const statements = state.capturePrereqs(() => {
		for (let element of assignmentPattern.elements) {
			if (ts.isOmittedExpression(element)) {
				luau.list.push(writes, luau.tempId());
			} else if (ts.isSpreadElement(element)) {
				assert(false, "Cannot optimize-assign spread element");
			} else {
				let initializer: ts.Expression | undefined;
				if (ts.isBinaryExpression(element)) {
					initializer = skipDownwards(element.right);
					element = skipDownwards(element.left);
				}

				if (
					ts.isIdentifier(element) ||
					ts.isElementAccessExpression(element) ||
					ts.isPropertyAccessExpression(element)
				) {
					const [id, idPrereqs] = state.capture(() => transformWritableExpression(state, element, true));
					luau.list.pushList(writesPrereqs, idPrereqs);
					luau.list.push(writes, id);
					if (initializer) {
						state.prereq(transformInitializer(state, id, initializer));
					}
				} else if (ts.isArrayLiteralExpression(element)) {
					const id = luau.tempId("binding");
					luau.list.push(variables, id);
					luau.list.push(writes, id);
					if (initializer) {
						state.prereq(transformInitializer(state, id, initializer));
					}
					transformArrayAssignmentPattern(state, element, id);
				} else if (ts.isObjectLiteralExpression(element)) {
					const id = luau.tempId("binding");
					luau.list.push(variables, id);
					luau.list.push(writes, id);
					if (initializer) {
						state.prereq(transformInitializer(state, id, initializer));
					}
					transformObjectAssignmentPattern(state, element, id);
				} else {
					assert(
						false,
						`transformOptimizedArrayAssignmentPattern invalid element: ${getKindName(element.kind)}`,
					);
				}
			}
		}
	});
	if (!luau.list.isEmpty(variables)) {
		state.prereq(
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: variables,
				right: undefined,
			}),
		);
	}
	state.prereqList(writesPrereqs);
	assert(!luau.list.isEmpty(writes));
	state.prereq(
		luau.create(luau.SyntaxKind.Assignment, {
			left: writes,
			operator: "=",
			right: rhs,
		}),
	);
	state.prereqList(statements);
}

export function transformBinaryExpression(state: TransformState, node: ts.BinaryExpression) {
	const operatorKind = node.operatorToken.kind;

	validateNotAnyType(state, node.left);
	validateNotAnyType(state, node.right);

	// banned
	if (operatorKind === ts.SyntaxKind.EqualsEqualsToken) {
		DiagnosticService.addDiagnostic(errors.noEqualsEquals(node));
		return luau.none();
	} else if (operatorKind === ts.SyntaxKind.ExclamationEqualsToken) {
		DiagnosticService.addDiagnostic(errors.noExclamationEquals(node));
		return luau.none();
	}

	// logical
	if (
		operatorKind === ts.SyntaxKind.AmpersandAmpersandToken ||
		operatorKind === ts.SyntaxKind.BarBarToken ||
		operatorKind === ts.SyntaxKind.QuestionQuestionToken
	) {
		return transformLogical(state, node);
	}

	if (ts.isLogicalOrCoalescingAssignmentExpression(node)) {
		return transformLogicalOrCoalescingAssignmentExpression(state, node);
	}

	if (ts.isAssignmentOperator(operatorKind)) {
		// in destructuring, rhs must be executed first
		if (ts.isArrayLiteralExpression(node.left)) {
			const rightExp = transformExpression(state, node.right);

			// optimize empty array destructure
			if (node.left.elements.length === 0) {
				if (isUsedAsStatement(node) && luau.isArray(rightExp) && luau.list.isEmpty(rightExp.members)) {
					return luau.none();
				}
				return rightExp;
			}

			if (
				luau.isCall(rightExp) &&
				isLuaTupleType(state)(state.getType(node.right)) &&
				!arrayLikeExpressionContainsSpread(node.left)
			) {
				transformOptimizedArrayAssignmentPattern(state, node.left, rightExp);
				if (!isUsedAsStatement(node)) {
					DiagnosticService.addDiagnostic(errors.noLuaTupleDestructureAssignmentExpression(node));
				}
				return luau.none();
			}

			if (
				luau.isArray(rightExp) &&
				!luau.list.isEmpty(rightExp.members) &&
				isUsedAsStatement(node) &&
				!arrayLikeExpressionContainsSpread(node.left)
			) {
				transformOptimizedArrayAssignmentPattern(state, node.left, rightExp.members);
				return luau.none();
			}

			const parentId = state.pushToVar(rightExp, "binding");
			transformArrayAssignmentPattern(state, node.left, parentId);
			return parentId;
		} else if (ts.isObjectLiteralExpression(node.left)) {
			const rightExp = transformExpression(state, node.right);

			// optimize empty object destructure
			if (node.left.properties.length === 0) {
				if (isUsedAsStatement(node) && luau.isMap(rightExp) && luau.list.isEmpty(rightExp.fields)) {
					return luau.none();
				}
				return rightExp;
			}

			const parentId = state.pushToVar(rightExp, "binding");
			transformObjectAssignmentPattern(state, node.left, parentId);
			return parentId;
		}

		const writableType = state.getType(node.left);
		const valueType = state.getType(node.right);
		const operator = getSimpleAssignmentOperator(writableType, operatorKind as ts.AssignmentOperator, valueType);
		const { writable, readable, value } = transformWritableAssignment(
			state,
			node.left,
			node.right,
			true,
			operator === undefined,
		);
		if (operator !== undefined) {
			return createAssignmentExpression(
				state,
				writable,
				operator,
				getAssignableValue(operator, value, valueType),
			);
		} else {
			return createCompoundAssignmentExpression(
				state,
				node,
				writable,
				writableType,
				readable,
				operatorKind,
				value,
				valueType,
			);
		}
	}

	if (isBitwiseOperator(operatorKind)) {
		return createBitwiseFromOperator(state, operatorKind, node);
	}

	const [left, right] = ensureTransformOrder(state, [node.left, node.right]);

	if (operatorKind === ts.SyntaxKind.InKeyword) {
		return luau.binary(
			luau.create(luau.SyntaxKind.ComputedIndexExpression, {
				expression: convertToIndexableExpression(right),
				index: left,
			}),
			"~=",
			luau.nil(),
		);
	} else if (operatorKind === ts.SyntaxKind.InstanceOfKeyword) {
		if (isPossiblyType(state.getType(node.right), isRobloxType(state))) {
			DiagnosticService.addDiagnostic(errors.noRobloxSymbolInstanceof(node.right));
		}
		return luau.call(state.TS(node, "instanceof"), [left, right]);
	}

	const leftType = state.getType(node.left);
	const rightType = state.getType(node.right);

	if (
		operatorKind === ts.SyntaxKind.LessThanToken ||
		operatorKind === ts.SyntaxKind.LessThanEqualsToken ||
		operatorKind === ts.SyntaxKind.GreaterThanToken ||
		operatorKind === ts.SyntaxKind.GreaterThanEqualsToken
	) {
		if (
			(!isDefinitelyType(leftType, isStringType) && !isDefinitelyType(leftType, isNumberType)) ||
			(!isDefinitelyType(rightType, isStringType) && !isDefinitelyType(leftType, isNumberType))
		) {
			DiagnosticService.addDiagnostic(errors.noNonNumberStringRelationOperator(node));
		}
	}

	return createBinaryFromOperator(state, node, left, leftType, operatorKind, right, rightType);
}
