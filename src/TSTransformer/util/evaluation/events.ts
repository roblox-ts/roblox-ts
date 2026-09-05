import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { EvaluationEffects, getChildren, getIntrinsicEffects, isLateRead } from "TSTransformer/util/evaluation/effects";
import { isConstantReference } from "TSTransformer/util/evaluation/facts";

export interface EvaluationReference {
	readonly operandIndex: number;
	readonly expression: luau.Expression;
	readonly effects: EvaluationEffects;
}

export interface EvaluationEvent {
	readonly effects: EvaluationEffects;
	readonly operandIndex?: number;
	readonly conditional?: boolean;
	readonly deferred?: boolean;
}

// field order differs from execution order when Luau reads a local's register
// directly; conditional and deferred uses must still preserve eager argument evaluation
export function getEvaluationEvents(
	statements: luau.List<luau.Statement>,
	result: luau.Expression,
	references: ReadonlyMap<number, EvaluationReference>,
) {
	const events = new Array<EvaluationEvent>();
	let mayExit = false;
	const getReference = (node: luau.Node) => (luau.isTemporaryIdentifier(node) ? references.get(node.id) : undefined);
	const isLateReference = (node: luau.Expression) => {
		const reference = getReference(node);
		return isLateRead(reference === undefined ? node : reference.expression);
	};

	function visit(node: luau.Node, conditional = false, deferred = false) {
		const reference = getReference(node);
		if (reference !== undefined) {
			events.push({
				effects: reference.effects,
				operandIndex: reference.operandIndex,
				conditional: conditional || mayExit,
				deferred,
			});
			return;
		}
		if (isConstantReference(node)) {
			return;
		}
		const visitExpression = (child: luau.Node) => visit(child, conditional, deferred);
		const visitStatements = (nodes: luau.List<luau.Statement>, uncertain = conditional) =>
			luau.list.forEach(nodes, child => visit(child, uncertain, deferred));
		const visitExpressions = (nodes: luau.Expression | luau.List<luau.Expression> | undefined) => {
			if (nodes === undefined) {
				return;
			}
			if (luau.list.isList(nodes)) {
				luau.list.forEach(nodes, visitExpression);
			} else {
				visitExpression(nodes);
			}
		};
		if (luau.isFunctionExpression(node)) {
			luau.list.forEach(node.statements, child => visit(child, true, true));
		} else if (luau.isBinaryExpression(node)) {
			const shortCircuit = node.operator === "and" || node.operator === "or";
			if (!shortCircuit && node.operator !== ".." && isLateReference(node.left)) {
				visitExpression(node.right);
				visitExpression(node.left);
			} else {
				visitExpression(node.left);
				visit(node.right, conditional || shortCircuit, deferred);
			}
		} else if (luau.isComputedIndexExpression(node)) {
			if (isLateReference(node.expression)) {
				visitExpression(node.index);
				visitExpression(node.expression);
			} else {
				visitExpression(node.expression);
				visitExpression(node.index);
			}
		} else if (luau.isCallExpression(node) || luau.isMethodCallExpression(node)) {
			visitExpression(node.expression);
			luau.list.forEach(node.args, visitExpression);
		} else if (luau.isVariableDeclaration(node)) {
			const targets = luau.list.isList(node.left) ? luau.list.toArray(node.left) : [node.left];
			assert(
				targets.every(target => getReference(target) === undefined),
				"A macro must not redeclare an operand reference",
			);
			visitExpressions(node.right);
		} else if (luau.isAssignment(node)) {
			const targets = luau.list.isList(node.left) ? luau.list.toArray(node.left) : [node.left];
			const delayed = new Array<luau.Expression>();
			for (const target of targets) {
				assert(getReference(target) === undefined, "A macro must not assign to an operand reference");
				if (!luau.isAnyIdentifier(target)) {
					if (isLateReference(target.expression)) {
						delayed.push(target.expression);
					} else {
						visitExpression(target.expression);
					}
					if (luau.isComputedIndexExpression(target)) {
						if (isLateReference(target.index)) {
							delayed.push(target.index);
						} else {
							visitExpression(target.index);
						}
					}
				}
				if (node.operator !== "=") {
					visitExpression(target);
				}
			}
			visitExpressions(node.right);
			delayed.forEach(visitExpression);
		} else if (luau.isIfExpression(node)) {
			visitExpression(node.condition);
			visit(node.expression, true, deferred);
			visit(node.alternative, true, deferred);
		} else if (luau.isIfStatement(node)) {
			visitExpression(node.condition);
			visitStatements(node.statements, true);
			if (luau.list.isList(node.elseBody)) {
				visitStatements(node.elseBody, true);
			} else {
				visit(node.elseBody, true, deferred);
			}
		} else if (luau.isForStatement(node)) {
			visitExpression(node.expression);
			visitStatements(node.statements, true);
		} else if (luau.isNumericForStatement(node)) {
			visitExpression(node.start);
			visitExpression(node.end);
			if (node.step) {
				visitExpression(node.step);
			}
			visitStatements(node.statements, true);
		} else if (luau.isWhileStatement(node) || luau.isRepeatStatement(node)) {
			visit(node.condition, true, deferred);
			visitStatements(node.statements, true);
		} else if (luau.isFunctionDeclaration(node) || luau.isMethodDeclaration(node)) {
			luau.list.forEach(node.statements, child => visit(child, true, true));
		} else {
			getChildren(node).forEach(visitExpression);
		}
		if (
			!deferred &&
			(luau.isReturnStatement(node) || luau.isBreakStatement(node) || luau.isContinueStatement(node))
		) {
			mayExit = true;
		}
		events.push({ effects: getIntrinsicEffects(node) });
	}
	luau.list.forEach(statements, statement => visit(statement));
	visit(result);

	return events;
}
