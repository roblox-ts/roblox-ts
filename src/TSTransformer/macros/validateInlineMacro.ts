import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";

/**
 * Visits `expression` and its subexpressions in Luau evaluation order (left-to-right
 * AST order), invoking `callback` on each.
 */
function visitExpressions(expression: luau.Expression, callback: (expression: luau.Expression) => void) {
	callback(expression);
	if (luau.isParenthesizedExpression(expression) || luau.isUnaryExpression(expression)) {
		visitExpressions(expression.expression, callback);
	} else if (luau.isPropertyAccessExpression(expression)) {
		visitExpressions(expression.expression, callback);
	} else if (luau.isComputedIndexExpression(expression)) {
		visitExpressions(expression.expression, callback);
		visitExpressions(expression.index, callback);
	} else if (luau.isBinaryExpression(expression)) {
		visitExpressions(expression.left, callback);
		visitExpressions(expression.right, callback);
	} else if (luau.isIfExpression(expression)) {
		visitExpressions(expression.condition, callback);
		visitExpressions(expression.expression, callback);
		visitExpressions(expression.alternative, callback);
	} else if (luau.isCallExpression(expression) || luau.isMethodCallExpression(expression)) {
		visitExpressions(expression.expression, callback);
		luau.list.forEach(expression.args, arg => visitExpressions(arg, callback));
	} else if (luau.isArray(expression) || luau.isSet(expression)) {
		luau.list.forEach(expression.members, member => visitExpressions(member, callback));
	} else if (luau.isMap(expression)) {
		luau.list.forEach(expression.fields, field => {
			visitExpressions(field.index, callback);
			visitExpressions(field.value, callback);
		});
	} else if (luau.isMixedTable(expression)) {
		luau.list.forEach(expression.fields, field => {
			if (luau.isMapField(field)) {
				visitExpressions(field.index, callback);
				visitExpressions(field.value, callback);
			} else {
				visitExpressions(field, callback);
			}
		});
	} else if (luau.isInterpolatedString(expression)) {
		luau.list.forEach(expression.parts, part => {
			if (!luau.isInterpolatedStringPart(part)) {
				visitExpressions(part, callback);
			}
		});
	}
	// identifiers, temporaries, literals, function expressions: no subexpressions to visit
	// (function expression bodies only run when called, which cannot happen while the
	// surrounding expression is still being evaluated)
}

/**
 * Enforces the contract of `effects: "none"` macros while running tests: the macro must
 * emit no prerequisite statements and its result expression must embed each raw operand
 * at most once, in operand order — so that Luau's left-to-right expression evaluation
 * reproduces TypeScript's operand evaluation order exactly.
 *
 * Operand AST nodes are unique objects, so occurrences are detected by identity.
 */
export function validateInlineMacro(
	macroName: string,
	operands: ReadonlyArray<luau.Expression>,
	result: luau.Expression,
	prereqs: luau.List<luau.Statement>,
) {
	assert(
		luau.list.isEmpty(prereqs),
		`macro ${macroName} is declared \`effects: "none"\` but emitted prerequisite statements`,
	);

	const operandSet = new Set(operands);
	const seenOrder = new Array<luau.Expression>();
	visitExpressions(result, expression => {
		if (operandSet.has(expression)) {
			assert(
				!seenOrder.includes(expression),
				`macro ${macroName} is declared \`effects: "none"\` but uses an operand more than once`,
			);
			seenOrder.push(expression);
		}
	});

	// used operands must appear in operand order (skipping unused ones)
	let lastIndex = -1;
	for (const used of seenOrder) {
		const index = operands.indexOf(used);
		assert(
			index > lastIndex,
			`macro ${macroName} is declared \`effects: "none"\` but embeds operands out of evaluation order`,
		);
		lastIndex = index;
	}
}
