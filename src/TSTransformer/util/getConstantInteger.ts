import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { getAncestor, isAncestorOf, skipDownwards } from "TSTransformer/util/traversal";
import ts from "typescript";

function getBindingInitializer(declaration: ts.VariableDeclaration | ts.BindingElement): ts.Expression | undefined {
	if (ts.isVariableDeclaration(declaration)) {
		return declaration.initializer;
	}

	const pattern = declaration.parent;
	const parent = pattern.parent;
	if (
		ts.isArrayBindingPattern(pattern) &&
		ts.isVariableDeclaration(parent) &&
		parent.initializer &&
		!declaration.dotDotDotToken
	) {
		const initializer = skipDownwards(parent.initializer);
		if (ts.isArrayLiteralExpression(initializer) && !initializer.elements.some(ts.isSpreadElement)) {
			const element = initializer.elements[pattern.elements.indexOf(declaration)];
			if (element && !ts.isOmittedExpression(element)) {
				return element;
			}
		}
	}
}

function getConstantNumber(
	state: TransformState,
	expression: ts.Expression,
	requireInitialized: boolean,
	getInteger: (expression: ts.Expression) => number | undefined,
): number | undefined {
	if (ts.isNumericLiteral(expression)) {
		return Number(expression.text);
	}

	if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.MinusToken) {
		const value = getInteger(expression.operand);
		if (value !== undefined) {
			return -value;
		}
	}

	if (ts.isBinaryExpression(expression)) {
		const left = getInteger(expression.left);
		const right = getInteger(expression.right);
		if (left !== undefined && right !== undefined) {
			switch (expression.operatorToken.kind) {
				case ts.SyntaxKind.PlusToken:
					return left + right;
				case ts.SyntaxKind.MinusToken:
					return left - right;
				case ts.SyntaxKind.AsteriskToken:
					return left * right;
				case ts.SyntaxKind.SlashToken:
					return left / right;
				case ts.SyntaxKind.AsteriskAsteriskToken:
					return left ** right;
			}
		}
	}

	if (ts.isIdentifier(expression)) {
		const symbol = state.typeChecker.getSymbolAtLocation(expression);
		assert(symbol);
		const declaration = symbol.valueDeclaration;
		if (!declaration || (!ts.isVariableDeclaration(declaration) && !ts.isBindingElement(declaration))) {
			return undefined;
		}

		let variable: ts.Node = declaration;
		while (ts.isBindingElement(variable)) {
			variable = variable.parent.parent;
		}
		if (
			!ts.isVariableDeclaration(variable) ||
			variable.getSourceFile() !== expression.getSourceFile() ||
			!(variable.parent.flags & ts.NodeFlags.Const) ||
			(ts.getCombinedModifierFlags(variable) & ts.ModifierFlags.Ambient) !== 0 ||
			!variable.initializer
		) {
			return undefined;
		}

		// steps are read before the body in a numeric loop, even if the source would break first
		// captured bindings may still be uninitialized when their function is called
		if (requireInitialized) {
			const declarationStatement = variable.parent.parent;
			if (
				variable.end > expression.pos ||
				!isAncestorOf(declarationStatement.parent, expression) ||
				getAncestor(variable, ts.isFunctionLike) !== getAncestor(expression, ts.isFunctionLike)
			) {
				return undefined;
			}
		}

		const initializer = getBindingInitializer(declaration);
		if (initializer) {
			return getInteger(initializer);
		}
	}
}

// numeric loops hoist bound and step reads, so reject effects and mutable references
// infer values from initializers, since literal-typed properties can change through wider aliases
export function getConstantInteger(
	state: TransformState,
	expression: ts.Expression,
	requireInitialized = false,
): number | undefined {
	// share initializer results within this analysis, including failures to prove an integer
	// separate calls retain their own initialization requirements and reference checks
	const cache = new Map<ts.Expression, number | undefined>();
	function getInteger(expression: ts.Expression): number | undefined {
		expression = skipDownwards(expression);
		if (cache.has(expression)) {
			return cache.get(expression);
		}

		const value = getConstantNumber(state, expression, requireInitialized, getInteger);
		const integer = value !== undefined && Number.isSafeInteger(value) ? value : undefined;
		cache.set(expression, integer);
		return integer;
	}

	return getInteger(expression);
}
