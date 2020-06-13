import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformArrayBindingLiteral } from "TSTransformer/nodes/binding/transformArrayBindingLiteral";
import { transformObjectBindingLiteral } from "TSTransformer/nodes/binding/transformObjectBindingLiteral";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { transformLogical } from "TSTransformer/nodes/transformLogical";
import {
	transformWritableAssignmentWithType,
	transformWritableExpression,
} from "TSTransformer/nodes/transformWritable";
import { createAssignmentExpression, createCompoundAssignmentExpression } from "TSTransformer/util/assignment";
import { getSubType } from "TSTransformer/util/binding/getSubType";
import { createBinaryFromOperator } from "TSTransformer/util/createBinaryFromOperator";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { isUsedAsStatement } from "TSTransformer/util/isUsedAsStatement";
import { skipDownwards } from "TSTransformer/util/traversal";
import { isLuaTupleType, isNumberType } from "TSTransformer/util/types";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";

function transformLuaTupleDestructure(
	state: TransformState,
	bindingLiteral: ts.ArrayLiteralExpression,
	value: lua.Expression,
	accessType: ts.Type,
) {
	let index = 0;
	const writes = lua.list.make<lua.WritableExpression>();
	const statements = state.capturePrereqs(() => {
		for (let element of bindingLiteral.elements) {
			if (ts.isOmittedExpression(element)) {
				lua.list.push(writes, lua.emptyId());
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
					lua.list.push(writes, id);
					if (initializer) {
						state.prereq(transformInitializer(state, id, initializer));
					}
				} else if (ts.isArrayLiteralExpression(element)) {
					const id = lua.tempId();
					lua.list.push(writes, id);
					if (initializer) {
						state.prereq(transformInitializer(state, id, initializer));
					}
					transformArrayBindingLiteral(state, element, id, getSubType(state, accessType, index));
				} else if (ts.isObjectLiteralExpression(element)) {
					const id = lua.tempId();
					lua.list.push(writes, id);
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
		lua.create(lua.SyntaxKind.Assignment, {
			left: writes,
			right: value,
		}),
	);
	state.prereqList(statements);
}

function createBinaryIn(left: lua.Expression, right: lua.Expression) {
	const leftExp = lua.create(lua.SyntaxKind.ComputedIndexExpression, {
		expression: convertToIndexableExpression(right),
		index: left,
	});
	return lua.binary(leftExp, "~=", lua.nil());
}

function createBinaryInstanceOf(state: TransformState, left: lua.Expression, right: lua.Expression) {
	left = state.pushToVarIfComplex(left);
	right = state.pushToVarIfComplex(right);

	const returnId = state.pushToVar(lua.bool(false));
	const objId = lua.tempId();
	const metatableId = lua.tempId();

	state.prereq(
		lua.create(lua.SyntaxKind.IfStatement, {
			condition: lua.create(lua.SyntaxKind.BinaryExpression, {
				left: lua.create(lua.SyntaxKind.CallExpression, {
					expression: lua.globals.type,
					args: lua.list.make(left),
				}),
				operator: "==",
				right: lua.string("table"),
			}),
			statements: lua.list.make<lua.Statement>(
				// objId = getmetatable(obj)
				lua.create(lua.SyntaxKind.VariableDeclaration, {
					left: objId,
					right: lua.create(lua.SyntaxKind.CallExpression, {
						expression: lua.globals.getmetatable,
						args: lua.list.make(left),
					}),
				}),
				lua.create(lua.SyntaxKind.WhileStatement, {
					// objId ~= nil
					condition: lua.create(lua.SyntaxKind.BinaryExpression, {
						left: objId,
						operator: "~=",
						right: lua.nil(),
					}),
					statements: lua.list.make<lua.Statement>(
						lua.create(lua.SyntaxKind.IfStatement, {
							// objId == class
							condition: lua.create(lua.SyntaxKind.BinaryExpression, {
								left: objId,
								operator: "==",
								right,
							}),
							statements: lua.list.make<lua.Statement>(
								// returnId = true
								// break
								lua.create(lua.SyntaxKind.Assignment, {
									left: returnId,
									right: lua.bool(true),
								}),
								lua.create(lua.SyntaxKind.BreakStatement, {}),
							),
							elseBody: lua.list.make<lua.Statement>(
								// local metatableId = getmetatable(objId)
								lua.create(lua.SyntaxKind.VariableDeclaration, {
									left: metatableId,
									right: lua.create(lua.SyntaxKind.CallExpression, {
										expression: lua.globals.getmetatable,
										args: lua.list.make(objId),
									}),
								}),
								// if metatableId then
								lua.create(lua.SyntaxKind.IfStatement, {
									condition: metatableId,
									statements: lua.list.make(
										// objId = metatableId.__index
										lua.create(lua.SyntaxKind.Assignment, {
											left: objId,
											right: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
												expression: metatableId,
												name: "__index",
											}),
										}),
									),
									elseBody: lua.list.make(lua.create(lua.SyntaxKind.BreakStatement, {})),
								}),
							),
						}),
					),
				}),
			),
			elseBody: lua.list.make(),
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
		return lua.emptyId();
	} else if (operatorKind === ts.SyntaxKind.ExclamationEqualsToken) {
		state.addDiagnostic(diagnostics.noExclamationEquals(node));
		return lua.emptyId();
	} else if (operatorKind === ts.SyntaxKind.CommaToken) {
		state.addDiagnostic(diagnostics.noComma(node));
		return lua.emptyId();
	}

	// logical
	if (
		operatorKind === ts.SyntaxKind.AmpersandAmpersandToken ||
		operatorKind === ts.SyntaxKind.BarBarToken ||
		operatorKind === ts.SyntaxKind.QuestionQuestionToken
	) {
		return transformLogical(state, node);
	}

	if (ts.isAssignmentOperator(operatorKind)) {
		// in destructuring, rhs must be executed first
		if (ts.isArrayLiteralExpression(node.left)) {
			const rightExp = transformExpression(state, node.right);
			const accessType = state.getType(node.right);

			if (lua.isCall(rightExp) && isLuaTupleType(state, accessType)) {
				transformLuaTupleDestructure(state, node.left, rightExp, accessType);
				if (!isUsedAsStatement(node)) {
					state.addDiagnostic(diagnostics.noDestructureAssignmentExpression(node));
				}
				return lua.emptyId();
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

		const { writable, readable, value } = transformWritableAssignmentWithType(
			state,
			node.left,
			node.right,
			ts.isCompoundAssignment(operatorKind),
		);
		if (ts.isCompoundAssignment(operatorKind)) {
			return createCompoundAssignmentExpression(state, writable, readable, operatorKind, value);
		} else {
			return createAssignmentExpression(state, writable.node, value.node);
		}
	}

	const [left, right] = ensureTransformOrder(state, [node.left, node.right]);

	if (operatorKind === ts.SyntaxKind.InKeyword) {
		return createBinaryIn(left, right);
	} else if (operatorKind === ts.SyntaxKind.InstanceOfKeyword) {
		return createBinaryInstanceOf(state, left, right);
	}

	// TODO issue #715
	if (
		operatorKind === ts.SyntaxKind.LessThanToken ||
		operatorKind === ts.SyntaxKind.LessThanEqualsToken ||
		operatorKind === ts.SyntaxKind.GreaterThanToken ||
		operatorKind === ts.SyntaxKind.GreaterThanEqualsToken
	) {
		if (!isNumberType(state.getType(node.left)) || !isNumberType(state.getType(node.right))) {
			state.addDiagnostic(diagnostics.noNonNumberRelationOperator(node));
		}
	}

	return createBinaryFromOperator(
		state,
		{
			node: left,
			type: state.getSimpleTypeFromNode(node.left),
		},
		operatorKind,
		{
			node: right,
			type: state.getSimpleTypeFromNode(node.right),
		},
	);
}
