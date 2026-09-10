import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import {
	EvaluationEffects,
	forEachChild,
	getIntrinsicEffects,
	isLateRead,
} from "TSTransformer/util/evaluation/effects";
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
}

const MACRO_STATEMENTS = new Set([
	luau.SyntaxKind.VariableDeclaration,
	luau.SyntaxKind.Assignment,
	luau.SyntaxKind.IfStatement,
	luau.SyntaxKind.ForStatement,
	luau.SyntaxKind.NumericForStatement,
	luau.SyntaxKind.CallStatement,
	luau.SyntaxKind.Comment,
	luau.SyntaxKind.BreakStatement,
]);

// field order differs from execution order when Luau reads a local's register
// directly; conditional uses must still preserve eager argument evaluation
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

	function visit(node: luau.Node, conditional = false) {
		const reference = getReference(node);
		if (reference !== undefined) {
			events.push({
				effects: reference.effects,
				operandIndex: reference.operandIndex,
				conditional: conditional || mayExit,
			});
			return;
		}
		if (isConstantReference(node)) {
			return;
		}
		// source callbacks are opaque operands. New macro-owned control flow needs
		// an ordering rule here before it can safely contain operand references.
		assert(!luau.isStatement(node) || MACRO_STATEMENTS.has(node.kind));
		assert(!luau.isFunctionExpression(node));
		const visitExpression = (child: luau.Node) => visit(child, conditional);
		const visitStatements = (nodes: luau.List<luau.Statement>) =>
			luau.list.forEach(nodes, child => visit(child, true));
		if (luau.isBinaryExpression(node)) {
			const shortCircuit = node.operator === "and" || node.operator === "or";
			if (!shortCircuit && node.operator !== ".." && isLateReference(node.left)) {
				visitExpression(node.right);
				visitExpression(node.left);
			} else {
				visitExpression(node.left);
				visit(node.right, conditional || shortCircuit);
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
			assert(!luau.list.isList(node.left));
			assert(!luau.list.isList(node.right));
			assert(getReference(node.left) === undefined, "A macro must not redeclare an operand reference");
			if (node.right) {
				visitExpression(node.right);
			}
		} else if (luau.isAssignment(node)) {
			assert(!luau.list.isList(node.left));
			assert(!luau.list.isList(node.right));
			const target = node.left;
			const delayed = new Array<luau.Expression>();
			assert(getReference(target) === undefined, "A macro must not assign to an operand reference");
			if (!luau.isAnyIdentifier(target)) {
				assert(luau.isComputedIndexExpression(target));
				if (isLateReference(target.expression)) {
					delayed.push(target.expression);
				} else {
					visitExpression(target.expression);
				}
				if (isLateReference(target.index)) {
					delayed.push(target.index);
				} else {
					visitExpression(target.index);
				}
			}
			if (node.operator !== "=") {
				visitExpression(target);
			}
			visitExpression(node.right);
			delayed.forEach(visitExpression);
		} else if (luau.isIfExpression(node)) {
			visitExpression(node.condition);
			visit(node.expression, true);
			visit(node.alternative, true);
		} else if (luau.isIfStatement(node)) {
			assert(luau.list.isList(node.elseBody));
			visitExpression(node.condition);
			visitStatements(node.statements);
			visitStatements(node.elseBody);
		} else if (luau.isForStatement(node)) {
			visitExpression(node.expression);
			visitStatements(node.statements);
		} else if (luau.isNumericForStatement(node)) {
			assert(node.step === undefined);
			visitExpression(node.start);
			visitExpression(node.end);
			visitStatements(node.statements);
		} else {
			forEachChild(node, visitExpression);
		}
		if (luau.isBreakStatement(node)) {
			mayExit = true;
		}
		events.push({ effects: getIntrinsicEffects(node) });
	}
	luau.list.forEach(statements, statement => visit(statement));
	visit(result);

	return events;
}
