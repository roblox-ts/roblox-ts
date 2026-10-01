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
import { arrayLikeExpressionContainsSpread } from "TSTransformer/util/arrayLikeExpressionContainsSpread";
import {
	createAssignmentExpression,
	createCompoundAssignmentExpression,
	getSimpleAssignmentOperator,
} from "TSTransformer/util/assignment";
import { objectAccessor } from "TSTransformer/util/binding/objectAccessor";
import { createBitwiseFromOperator, isBitwiseOperator } from "TSTransformer/util/bitwise";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { createBinaryFromOperator } from "TSTransformer/util/createBinaryFromOperator";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { effectsCommute, getEffects, joinEffects, NO_EFFECTS } from "TSTransformer/util/evaluation/effects";
import { getAssignableValue } from "TSTransformer/util/getAssignableValue";
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
	const bindingPrereqs = new Prereqs();
	for (let element of assignmentPattern.elements) {
		if (ts.isOmittedExpression(element)) {
			luau.list.push(writes, luau.tempId());
		} else {
			// callers only select this optimization for patterns without spread elements
			assert(!ts.isSpreadElement(element), "Cannot optimize-assign spread element");
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
					bindingPrereqs.push(transformInitializer(state, id, initializer));
				}
			} else if (ts.isArrayLiteralExpression(element)) {
				const id = luau.tempId("binding");
				luau.list.push(variables, id);
				luau.list.push(writes, id);
				if (initializer) {
					bindingPrereqs.push(transformInitializer(state, id, initializer));
				}
				transformArrayAssignmentPattern(state, bindingPrereqs, element, id);
			} else {
				assert(ts.isObjectLiteralExpression(element), "Expected object assignment pattern");
				const id = luau.tempId("binding");
				luau.list.push(variables, id);
				luau.list.push(writes, id);
				if (initializer) {
					bindingPrereqs.push(transformInitializer(state, id, initializer));
				}
				transformObjectAssignmentPattern(state, bindingPrereqs, element, id);
			}
		}
	}
	if (!luau.list.isEmpty(variables)) {
		prereqs.push(
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: variables,
				right: undefined,
			}),
		);
	}

	let targetEffects = getEffects(writesPrereqs);
	luau.list.forEach(writes, target => {
		if (!luau.isAnyIdentifier(target)) {
			targetEffects = joinEffects(
				targetEffects,
				getEffects(target.expression),
				luau.isComputedIndexExpression(target) ? getEffects(target.index) : NO_EFFECTS,
			);
		}
	});

	// the complete RHS precedes destination evaluation, including newly hoisted captures
	if (luau.list.isList(rhs)) {
		const expressions = luau.list.toArray(rhs);
		const captures = new Array<boolean>(expressions.length);
		for (let i = expressions.length - 1; i >= 0; i--) {
			const effects = getEffects(expressions[i]);
			captures[i] = !effectsCommute(effects, targetEffects);
			if (captures[i]) {
				targetEffects = joinEffects(effects, targetEffects);
			}
		}
		rhs = luau.list.make(
			...expressions.flatMap((expression, index) => {
				if (!captures[index]) {
					return [expression];
				}

				// a final array member can supply multiple return values to the remaining destinations
				if (index === expressions.length - 1 && luau.isCall(expression)) {
					const count = luau.list.size(writes) - index;
					if (count > 1) {
						const ids = Array.from({ length: count }, () => luau.tempId("binding"));
						prereqs.push(
							luau.create(luau.SyntaxKind.VariableDeclaration, {
								left: luau.list.make(...ids),
								right: expression,
							}),
						);
						return ids;
					}
				}

				return [prereqs.pushToVar(expression, "binding")];
			}),
		);
	} else if (!effectsCommute(getEffects(rhs), targetEffects)) {
		const captures = luau.list.make(...luau.list.toArray(writes).map(() => luau.tempId("binding")));
		prereqs.push(luau.create(luau.SyntaxKind.VariableDeclaration, { left: captures, right: rhs }));
		rhs = captures;
	}

	prereqs.pushList(writesPrereqs);
	assert(!luau.list.isEmpty(writes));
	prereqs.push(
		luau.create(luau.SyntaxKind.Assignment, {
			left: writes,
			operator: "=",
			right: rhs,
		}),
	);
	prereqs.pushList(bindingPrereqs.statements);
}

function tryTransformOptimizedObjectAssignmentPattern(
	state: TransformState,
	prereqs: Prereqs,
	assignmentPattern: ts.ObjectLiteralExpression,
	rhs: luau.Expression,
) {
	if (assignmentPattern.properties.length !== 1) {
		return false;
	}

	const property = assignmentPattern.properties[0];
	if (
		!(ts.isShorthandPropertyAssignment(property) || ts.isPropertyAssignment(property)) ||
		!ts.isIdentifier(property.name)
	) {
		return false;
	}

	let target = ts.isShorthandPropertyAssignment(property) ? property.name : property.initializer;
	let initializer = ts.isShorthandPropertyAssignment(property) ? property.objectAssignmentInitializer : undefined;
	if (ts.isBinaryExpression(target)) {
		initializer = skipDownwards(target.right);
		target = skipDownwards(target.left);
	}

	// property and indexed targets can evaluate before an inline receiver
	if (!ts.isIdentifier(target)) {
		return false;
	}

	const { value } = objectAccessor(
		state,
		prereqs,
		convertToIndexableExpression(rhs),
		state.typeChecker.getTypeOfAssignmentPattern(assignmentPattern),
		property.name,
	);
	const writable = transformWritableExpression(state, prereqs, target, initializer !== undefined);
	prereqs.push(luau.create(luau.SyntaxKind.Assignment, { left: writable, operator: "=", right: value }));
	if (initializer) {
		prereqs.push(transformInitializer(state, writable, initializer));
	}

	return true;
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

			if (
				luau.isCall(rightExp) &&
				isLuaTupleType(state)(state.getType(node.right)) &&
				!arrayLikeExpressionContainsSpread(node.left)
			) {
				transformOptimizedArrayAssignmentPattern(state, prereqs, node.left, rightExp);
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

			// a used assignment expression must still return the original receiver
			if (
				isUsedAsStatement(node) &&
				tryTransformOptimizedObjectAssignmentPattern(state, prereqs, node.left, rightExp)
			) {
				return luau.none();
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
			operator !== "=",
		);
		if (operator !== undefined) {
			return createAssignmentExpression(
				prereqs,
				writable,
				operator,
				getAssignableValue(operator, value, valueType),
				readable,
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

	if (isBitwiseOperator(operatorKind)) {
		return createBitwiseFromOperator(state, prereqs, operatorKind, node);
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
