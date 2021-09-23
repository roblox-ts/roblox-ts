import luau from "LuauAST";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformArrayBindingLiteral } from "TSTransformer/nodes/binding/transformArrayBindingLiteral";
import { transformObjectBindingLiteral } from "TSTransformer/nodes/binding/transformObjectBindingLiteral";
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
import { getSubType } from "TSTransformer/util/binding/getSubType";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { createBinaryFromOperator } from "TSTransformer/util/createBinaryFromOperator";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { isUsedAsStatement } from "TSTransformer/util/isUsedAsStatement";
import { skipDownwards } from "TSTransformer/util/traversal";
import { isDefinitelyType, isLuaTupleType, isNumberType, isStringType } from "TSTransformer/util/types";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";
import ts from "typescript";

function transformLuaTupleDestructure(
	state: TransformState,
	bindingLiteral: ts.ArrayLiteralExpression,
	value: luau.Expression,
	accessType: ts.Type,
) {
	let index = 0;
	const variables = luau.list.make<luau.TemporaryIdentifier>();
	const writes = luau.list.make<luau.WritableExpression>();
	const statements = state.capturePrereqs(() => {
		for (let element of bindingLiteral.elements) {
			if (ts.isOmittedExpression(element)) {
				luau.list.push(writes, luau.emptyId());
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
					const id = transformWritableExpression(state, element, true);
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
					transformArrayBindingLiteral(state, element, id, getSubType(state, accessType, index));
				} else if (ts.isObjectLiteralExpression(element)) {
					const id = luau.tempId("binding");
					luau.list.push(variables, id);
					luau.list.push(writes, id);
					if (initializer) {
						state.prereq(transformInitializer(state, id, initializer));
					}
					transformObjectBindingLiteral(state, element, id, getSubType(state, accessType, index));
				} else {
					assert(false);
				}
			}
			index++;
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
	if (luau.list.isEmpty(writes)) {
		if (luau.isCall(value)) {
			state.prereq(
				luau.create(luau.SyntaxKind.CallStatement, {
					expression: value,
				}),
			);
		} else {
			state.prereq(
				luau.create(luau.SyntaxKind.VariableDeclaration, {
					left: luau.list.make(luau.emptyId()),
					right: value,
				}),
			);
		}
	} else {
		state.prereq(
			luau.create(luau.SyntaxKind.Assignment, {
				left: writes,
				operator: "=",
				right: value,
			}),
		);
	}
	state.prereqList(statements);
}

export function transformBinaryExpression(state: TransformState, node: ts.BinaryExpression) {
	const operatorKind = node.operatorToken.kind;

	validateNotAnyType(state, node.left);
	validateNotAnyType(state, node.right);

	// banned
	if (operatorKind === ts.SyntaxKind.EqualsEqualsToken) {
		DiagnosticService.addDiagnostic(errors.noEqualsEquals(node));
		return luau.emptyId();
	} else if (operatorKind === ts.SyntaxKind.ExclamationEqualsToken) {
		DiagnosticService.addDiagnostic(errors.noExclamationEquals(node));
		return luau.emptyId();
	} else if (operatorKind === ts.SyntaxKind.CommaToken) {
		DiagnosticService.addDiagnostic(errors.noComma(node));
		return luau.emptyId();
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
			const accessType = state.getType(node.right);

			if (luau.isCall(rightExp) && isLuaTupleType(state, accessType)) {
				transformLuaTupleDestructure(state, node.left, rightExp, accessType);
				if (!isUsedAsStatement(node)) {
					DiagnosticService.addDiagnostic(errors.noDestructureAssignmentExpression(node));
				}
				return luau.emptyId();
			}

			const parentId = state.pushToVar(rightExp, "binding");
			transformArrayBindingLiteral(state, node.left, parentId, accessType);
			return parentId;
		} else if (ts.isObjectLiteralExpression(node.left)) {
			const parentId = state.pushToVar(transformExpression(state, node.right), "binding");
			const accessType = state.getType(node.right);
			transformObjectBindingLiteral(state, node.left, parentId, accessType);
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
				operator === "..=" && !isDefinitelyType(valueType, t => isStringType(t))
					? luau.call(luau.globals.tostring, [value])
					: value,
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
		return luau.call(state.TS(node, "instanceof"), [left, right]);
	}

	const leftType = state.getType(node.left);
	const rightType = state.getType(node.right);

	// TODO issue #715
	if (
		operatorKind === ts.SyntaxKind.LessThanToken ||
		operatorKind === ts.SyntaxKind.LessThanEqualsToken ||
		operatorKind === ts.SyntaxKind.GreaterThanToken ||
		operatorKind === ts.SyntaxKind.GreaterThanEqualsToken
	) {
		if (
			(!isDefinitelyType(leftType, t => isStringType(t)) && !isDefinitelyType(leftType, t => isNumberType(t))) ||
			(!isDefinitelyType(rightType, t => isStringType(t)) && !isDefinitelyType(leftType, t => isNumberType(t)))
		) {
			DiagnosticService.addDiagnostic(errors.noNonNumberStringRelationOperator(node));
		}
	}

	return createBinaryFromOperator(state, node, left, leftType, operatorKind, right, rightType);
}
