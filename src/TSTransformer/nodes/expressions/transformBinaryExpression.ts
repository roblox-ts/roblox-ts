import ts from "byots";
import luau from "LuauAST";
import { diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
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
import { isLuaTupleType, isNumberType, isStringType } from "TSTransformer/util/types";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";
import { wrapToString } from "TSTransformer/util/wrapToString";

function transformLuaTupleDestructure(
	state: TransformState,
	bindingLiteral: ts.ArrayLiteralExpression,
	value: luau.Expression,
	accessType: ts.Type,
) {
	let index = 0;
	const writes = luau.list.make<luau.WritableExpression>();
	const statements = state.capturePrereqs(() => {
		for (let element of bindingLiteral.elements) {
			if (ts.isOmittedExpression(element)) {
				luau.list.push(writes, luau.emptyId());
			} else if (ts.isSpreadElement(element)) {
				state.addDiagnostic(diagnostics.noSpreadDestructuring(element));
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
					const id = luau.tempId();
					luau.list.push(writes, id);
					if (initializer) {
						state.prereq(transformInitializer(state, id, initializer));
					}
					transformArrayBindingLiteral(state, element, id, getSubType(state, accessType, index));
				} else if (ts.isObjectLiteralExpression(element)) {
					const id = luau.tempId();
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
	state.prereq(
		luau.create(luau.SyntaxKind.Assignment, {
			left: writes,
			operator: "=",
			right: value,
		}),
	);
	state.prereqList(statements);
}

function createBinaryIn(left: luau.Expression, right: luau.Expression) {
	const leftExp = luau.create(luau.SyntaxKind.ComputedIndexExpression, {
		expression: convertToIndexableExpression(right),
		index: left,
	});
	return luau.binary(leftExp, "~=", luau.nil());
}

function createBinaryInstanceOf(state: TransformState, left: luau.Expression, right: luau.Expression) {
	left = state.pushToVarIfComplex(left);
	right = state.pushToVarIfComplex(right);

	const returnId = state.pushToVar(luau.bool(false));
	const objId = luau.tempId();
	const metatableId = luau.tempId();

	state.prereq(
		luau.create(luau.SyntaxKind.IfStatement, {
			condition: luau.create(luau.SyntaxKind.BinaryExpression, {
				left: luau.create(luau.SyntaxKind.CallExpression, {
					expression: luau.globals.type,
					args: luau.list.make(left),
				}),
				operator: "==",
				right: luau.string("table"),
			}),
			statements: luau.list.make<luau.Statement>(
				// objId = getmetatable(obj)
				luau.create(luau.SyntaxKind.VariableDeclaration, {
					left: objId,
					right: luau.create(luau.SyntaxKind.CallExpression, {
						expression: luau.globals.getmetatable,
						args: luau.list.make(left),
					}),
				}),
				luau.create(luau.SyntaxKind.WhileStatement, {
					// objId ~= nil
					condition: luau.create(luau.SyntaxKind.BinaryExpression, {
						left: objId,
						operator: "~=",
						right: luau.nil(),
					}),
					statements: luau.list.make<luau.Statement>(
						luau.create(luau.SyntaxKind.IfStatement, {
							// objId == class
							condition: luau.create(luau.SyntaxKind.BinaryExpression, {
								left: objId,
								operator: "==",
								right,
							}),
							statements: luau.list.make<luau.Statement>(
								// returnId = true
								// break
								luau.create(luau.SyntaxKind.Assignment, {
									left: returnId,
									operator: "=",
									right: luau.bool(true),
								}),
								luau.create(luau.SyntaxKind.BreakStatement, {}),
							),
							elseBody: luau.list.make<luau.Statement>(
								// local metatableId = getmetatable(objId)
								luau.create(luau.SyntaxKind.VariableDeclaration, {
									left: metatableId,
									right: luau.create(luau.SyntaxKind.CallExpression, {
										expression: luau.globals.getmetatable,
										args: luau.list.make(objId),
									}),
								}),
								// if metatableId then
								luau.create(luau.SyntaxKind.IfStatement, {
									condition: metatableId,
									statements: luau.list.make(
										// objId = metatableId.__index
										luau.create(luau.SyntaxKind.Assignment, {
											left: objId,
											operator: "=",
											right: luau.create(luau.SyntaxKind.PropertyAccessExpression, {
												expression: metatableId,
												name: "__index",
											}),
										}),
									),
									elseBody: luau.list.make(luau.create(luau.SyntaxKind.BreakStatement, {})),
								}),
							),
						}),
					),
				}),
			),
			elseBody: luau.list.make(),
		}),
	);

	return returnId;
}

export function transformBinaryExpression(state: TransformState, node: ts.BinaryExpression) {
	const operatorKind = node.operatorToken.kind;

	validateNotAnyType(state, node.left);
	validateNotAnyType(state, node.right);

	// banned
	if (operatorKind === ts.SyntaxKind.EqualsEqualsToken) {
		state.addDiagnostic(diagnostics.noEqualsEquals(node));
		return luau.emptyId();
	} else if (operatorKind === ts.SyntaxKind.ExclamationEqualsToken) {
		state.addDiagnostic(diagnostics.noExclamationEquals(node));
		return luau.emptyId();
	} else if (operatorKind === ts.SyntaxKind.CommaToken) {
		state.addDiagnostic(diagnostics.noComma(node));
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
					state.addDiagnostic(diagnostics.noDestructureAssignmentExpression(node));
				}
				return luau.emptyId();
			}

			const parentId = state.pushToVar(rightExp);
			transformArrayBindingLiteral(state, node.left, parentId, accessType);
			return parentId;
		} else if (ts.isObjectLiteralExpression(node.left)) {
			const parentId = state.pushToVar(transformExpression(state, node.right));
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
				operator === "..=" && !isStringType(valueType) ? wrapToString(value) : value,
			);
		} else {
			return createCompoundAssignmentExpression(
				state,
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
		return createBinaryIn(left, right);
	} else if (operatorKind === ts.SyntaxKind.InstanceOfKeyword) {
		return createBinaryInstanceOf(state, left, right);
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
			(!isStringType(leftType) && !isNumberType(leftType)) ||
			(!isStringType(rightType) && !isNumberType(rightType))
		) {
			state.addDiagnostic(diagnostics.noNonNumberStringRelationOperator(node));
		}
	}

	return createBinaryFromOperator(state, left, leftType, operatorKind, right, rightType);
}
