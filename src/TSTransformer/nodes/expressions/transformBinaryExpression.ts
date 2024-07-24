import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformArrayAssignmentPattern } from "TSTransformer/nodes/binding/transformArrayAssignmentPattern";
import { transformObjectAssignmentPattern } from "TSTransformer/nodes/binding/transformObjectAssignmentPattern";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { transformLogical } from "TSTransformer/nodes/transformLogical";
import { transformLogicalOrCoalescingAssignmentExpression } from "TSTransformer/nodes/transformLogicalOrCoalescingAssignmentExpression";
import { transformWritableAssignment, transformWritableExpression } from "TSTransformer/nodes/transformWritable";
import {
	createAssignmentExpression,
	createCompoundAssignmentExpression,
	getSimpleAssignmentOperator,
} from "TSTransformer/util/assignment";
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
	prereqs: Prereqs,
	assignmentPattern: ts.ArrayLiteralExpression,
	rhs: luau.Expression | luau.List<luau.Expression>,
) {
	const variables = luau.list.make<luau.TemporaryIdentifier>();
	const writes = luau.list.make<luau.WritableExpression>();
	const writesPrereqs = luau.list.make<luau.Statement>();

	const statements = new Prereqs();
	for (let element of assignmentPattern.elements) {
		if (ts.isOmittedExpression(element)) {
			luau.list.push(writes, luau.tempId());
		} else if (ts.isSpreadElement(element)) {
			DiagnosticService.addDiagnostic(errors.noSpreadDestructuring(element));
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
				const idPrereqs = new Prereqs();
				const id = transformWritableExpression(state, idPrereqs, element, true);
				luau.list.pushList(writesPrereqs, idPrereqs.statements);
				luau.list.push(writes, id);
				if (initializer) {
					statements.prereq(transformInitializer(state, id, initializer));
				}
			} else if (ts.isArrayLiteralExpression(element)) {
				const id = luau.tempId("binding");
				luau.list.push(variables, id);
				luau.list.push(writes, id);
				if (initializer) {
					statements.prereq(transformInitializer(state, id, initializer));
				}
				transformArrayAssignmentPattern(state, statements, element, id);
			} else if (ts.isObjectLiteralExpression(element)) {
				const id = luau.tempId("binding");
				luau.list.push(variables, id);
				luau.list.push(writes, id);
				if (initializer) {
					statements.prereq(transformInitializer(state, id, initializer));
				}
				transformObjectAssignmentPattern(state, statements, element, id);
			} else {
				assert(false, `transformOptimizedArrayAssignmentPattern invalid element: ${getKindName(element.kind)}`);
			}
		}
	}

	if (!luau.list.isEmpty(variables)) {
		prereqs.prereq(
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: variables,
				right: undefined,
			}),
		);
	}
	prereqs.prereqList(writesPrereqs);
	assert(!luau.list.isEmpty(writes));
	prereqs.prereq(
		luau.create(luau.SyntaxKind.Assignment, {
			left: writes,
			operator: "=",
			right: rhs,
		}),
	);
	prereqs.prereqList(statements.statements);
}

export function transformBinaryExpression(state: TransformState, prereqs: Prereqs, node: ts.BinaryExpression) {
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
		return transformLogical(state, prereqs, node);
	}

	if (ts.isLogicalOrCoalescingAssignmentExpression(node)) {
		return transformLogicalOrCoalescingAssignmentExpression(state, prereqs, node);
	}

	if (ts.isAssignmentOperator(operatorKind)) {
		// in destructuring, rhs must be executed first
		if (ts.isArrayLiteralExpression(node.left)) {
			const rightExp = transformExpression(state, prereqs, node.right);

			// optimize empty array destructure
			if (node.left.elements.length === 0) {
				if (isUsedAsStatement(node) && luau.isArray(rightExp) && luau.list.isEmpty(rightExp.members)) {
					return luau.none();
				}
				return rightExp;
			}

			if (luau.isCall(rightExp) && isLuaTupleType(state)(state.getType(node.right))) {
				transformOptimizedArrayAssignmentPattern(state, prereqs, node.left, rightExp);
				if (!isUsedAsStatement(node)) {
					DiagnosticService.addDiagnostic(errors.noLuaTupleDestructureAssignmentExpression(node));
				}
				return luau.none();
			}

			if (luau.isArray(rightExp) && !luau.list.isEmpty(rightExp.members) && isUsedAsStatement(node)) {
				transformOptimizedArrayAssignmentPattern(state, prereqs, node.left, rightExp.members);
				return luau.none();
			}

			const parentId = prereqs.pushToVar(rightExp, "binding");
			transformArrayAssignmentPattern(state, prereqs, node.left, parentId);
			return parentId;
		} else if (ts.isObjectLiteralExpression(node.left)) {
			const rightExp = transformExpression(state, prereqs, node.right);

			// optimize empty object destructure
			if (node.left.properties.length === 0) {
				if (isUsedAsStatement(node) && luau.isMap(rightExp) && luau.list.isEmpty(rightExp.fields)) {
					return luau.none();
				}
				return rightExp;
			}

			const parentId = prereqs.pushToVar(rightExp, "binding");
			transformObjectAssignmentPattern(state, prereqs, node.left, parentId);
			return parentId;
		}

		const writableType = state.getType(node.left);
		const valueType = state.getType(node.right);
		const operator = getSimpleAssignmentOperator(writableType, operatorKind as ts.AssignmentOperator, valueType);
		const { writable, readable, value } = transformWritableAssignment(
			state,
			prereqs,
			node.left,
			node.right,
			true,
			operator === undefined,
		);
		if (operator !== undefined) {
			return createAssignmentExpression(
				prereqs,
				writable,
				operator,
				getAssignableValue(operator, value, valueType),
			);
		} else {
			return createCompoundAssignmentExpression(
				prereqs,
				writable,
				writableType,
				readable,
				operatorKind,
				value,
				valueType,
			);
		}
	}

	const [left, right] = ensureTransformOrder(state, prereqs, [node.left, node.right]);

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

	return createBinaryFromOperator(prereqs, left, leftType, operatorKind, right, rightType);
}
