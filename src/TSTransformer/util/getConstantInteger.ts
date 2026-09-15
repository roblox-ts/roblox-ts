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
): number | undefined {
	if (ts.isNumericLiteral(expression)) {
		return Number(expression.text);
	}

	if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.MinusToken) {
		const value = getConstantInteger(state, expression.operand, requireInitialized);
		if (value !== undefined) {
			return -value;
		}
	}

	if (ts.isBinaryExpression(expression)) {
		const left = getConstantInteger(state, expression.left, requireInitialized);
		const right = getConstantInteger(state, expression.right, requireInitialized);
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
			return getConstantInteger(state, initializer, requireInitialized);
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
	const value = getConstantNumber(state, skipDownwards(expression), requireInitialized);
	return value !== undefined && Number.isSafeInteger(value) ? value : undefined;
}
