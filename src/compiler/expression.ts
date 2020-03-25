import * as ts from "ts-morph";
import {
	compileArrayLiteralExpression,
	compileAwaitExpression,
	compileBinaryExpression,
	compileBooleanLiteral,
	compileCallExpression,
	compileClassExpression,
	compileConditionalExpression,
	compileElementAccessExpression,
	compileFunctionExpression,
	compileIdentifier,
	compileJsxElement,
	compileJsxSelfClosingElement,
	compileNewExpression,
	compileNumericLiteral,
	compileObjectLiteralExpression,
	compileParenthesizedExpression,
	compilePostfixUnaryExpression,
	compilePrefixUnaryExpression,
	compilePropertyAccessExpression,
	compileSpreadElement,
	compileStringLiteral,
	compileSuperExpression,
	compileTaggedTemplateExpression,
	compileTemplateExpression,
	compileYieldExpression,
	isSetToken,
} from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { isIdentifierWhoseDefinitionMatchesNode, skipNodesDownwards, skipNodesUpwards } from "../utility/general";
import { isMethodDeclaration } from "./function";

export function compileExpression(state: CompilerState, node: ts.Expression): string {
	if (ts.TypeGuards.isExpression(node)) {
		const compiledSource = state.alreadyCompiled.get(node);
		if (compiledSource) {
			return compiledSource;
		}
	}

	if (ts.TypeGuards.isStringLiteral(node) || ts.TypeGuards.isNoSubstitutionTemplateLiteral(node)) {
		return compileStringLiteral(state, node);
	} else if (ts.TypeGuards.isNumericLiteral(node)) {
		return compileNumericLiteral(state, node);
	} else if (ts.TypeGuards.isBooleanLiteral(node)) {
		return compileBooleanLiteral(state, node);
	} else if (ts.TypeGuards.isArrayLiteralExpression(node)) {
		return compileArrayLiteralExpression(state, node);
	} else if (ts.TypeGuards.isObjectLiteralExpression(node)) {
		return compileObjectLiteralExpression(state, node);
	} else if (ts.TypeGuards.isFunctionExpression(node) || ts.TypeGuards.isArrowFunction(node)) {
		return compileFunctionExpression(state, node);
	} else if (ts.TypeGuards.isCallExpression(node)) {
		return compileCallExpression(state, node);
	} else if (ts.TypeGuards.isIdentifier(node)) {
		return compileIdentifier(state, node);
	} else if (ts.TypeGuards.isBinaryExpression(node)) {
		return compileBinaryExpression(state, node);
	} else if (ts.TypeGuards.isPrefixUnaryExpression(node)) {
		return compilePrefixUnaryExpression(state, node);
	} else if (ts.TypeGuards.isPostfixUnaryExpression(node)) {
		return compilePostfixUnaryExpression(state, node);
	} else if (ts.TypeGuards.isPropertyAccessExpression(node)) {
		return compilePropertyAccessExpression(state, node);
	} else if (ts.TypeGuards.isNewExpression(node)) {
		return compileNewExpression(state, node);
	} else if (ts.TypeGuards.isParenthesizedExpression(node)) {
		return compileParenthesizedExpression(state, node);
	} else if (ts.TypeGuards.isTemplateExpression(node)) {
		return compileTemplateExpression(state, node);
	} else if (ts.TypeGuards.isTaggedTemplateExpression(node)) {
		return compileTaggedTemplateExpression(state, node);
	} else if (ts.TypeGuards.isElementAccessExpression(node)) {
		return compileElementAccessExpression(state, node);
	} else if (ts.TypeGuards.isAwaitExpression(node)) {
		return compileAwaitExpression(state, node);
	} else if (ts.TypeGuards.isConditionalExpression(node)) {
		return compileConditionalExpression(state, node);
	} else if (ts.TypeGuards.isJsxExpression(node)) {
		return compileExpression(state, node.getExpressionOrThrow());
	} else if (ts.TypeGuards.isJsxSelfClosingElement(node)) {
		return compileJsxSelfClosingElement(state, node);
	} else if (ts.TypeGuards.isJsxElement(node)) {
		return compileJsxElement(state, node);
	} else if (ts.TypeGuards.isSpreadElement(node)) {
		return compileSpreadElement(state, node);
	} else if (ts.TypeGuards.isClassExpression(node)) {
		return compileClassExpression(state, node);
	} else if (ts.TypeGuards.isYieldExpression(node)) {
		return compileYieldExpression(state, node);
	} else if (ts.TypeGuards.isOmittedExpression(node)) {
		return "nil";
	} else if (ts.TypeGuards.isThisExpression(node)) {
		if (
			!node.getFirstAncestor(
				ancestor =>
					isMethodDeclaration(ancestor) ||
					ts.TypeGuards.isClassDeclaration(ancestor) ||
					ts.TypeGuards.isObjectLiteralExpression(ancestor) ||
					ts.TypeGuards.isClassExpression(ancestor),
			)
		) {
			throw new CompilerError(
				"'this' may only be used inside a class definition, object literal, or method function",
				node,
				CompilerErrorType.NoThisOutsideClass,
			);
		}
		return "self";
	} else if (ts.TypeGuards.isSuperExpression(node)) {
		return compileSuperExpression(state, node);
	} else if (
		ts.TypeGuards.isAsExpression(node) ||
		ts.TypeGuards.isTypeAssertion(node) ||
		ts.TypeGuards.isNonNullExpression(node)
	) {
		return compileExpression(state, skipNodesDownwards(node.getExpression()));
	} else if (ts.TypeGuards.isNullLiteral(node)) {
		throw new CompilerError("'null' is not supported! Use 'undefined' instead.", node, CompilerErrorType.NoNull);
	} else if (ts.TypeGuards.isTypeOfExpression(node)) {
		throw new CompilerError(
			"'typeof' operator is not supported! Use `typeIs(value, type)` or `typeOf(value)` instead.",
			node,
			CompilerErrorType.NoTypeOf,
		);
	} else {
		throw new CompilerError(
			`Unexpected expression ( ${node.getKindName()} ) in compileExpression`,
			node,
			CompilerErrorType.BadExpression,
			true,
		);
	}
}

export function compileExpressionStatement(state: CompilerState, node: ts.ExpressionStatement) {
	state.enterPrecedingStatementContext();

	let expStr: string;
	const expression = skipNodesDownwards(node.getExpression());

	if (ts.TypeGuards.isCallExpression(expression)) {
		expStr = compileCallExpression(state, expression, true);
	} else {
		expStr = compileExpression(state, expression);

		// big set of rules for expression statements
		if (
			!ts.TypeGuards.isNewExpression(expression) &&
			!ts.TypeGuards.isAwaitExpression(expression) &&
			!ts.TypeGuards.isPostfixUnaryExpression(expression) &&
			!(
				ts.TypeGuards.isPrefixUnaryExpression(expression) &&
				(expression.getOperatorToken() === ts.SyntaxKind.PlusPlusToken ||
					expression.getOperatorToken() === ts.SyntaxKind.MinusMinusToken)
			) &&
			!(ts.TypeGuards.isBinaryExpression(expression) && isSetToken(expression.getOperatorToken().getKind())) &&
			!ts.TypeGuards.isYieldExpression(expression) &&
			!ts.TypeGuards.isJsxElement(expression)
		) {
			expStr = `local _ = ${expStr}`;
		}
	}

	const result = state.exitPrecedingStatementContextAndJoin();

	// this is a hack for the time being, to prevent double indenting
	// situations like these: ({ length } = "Hello, world!")
	const indent = expStr.match(/^\s+/) ? "" : state.indent;
	return expStr ? result + indent + expStr + ";\n" : result;
}

export function expressionModifiesVariable(
	node: ts.Node<ts.ts.Node>,
	lhs?: ts.Identifier,
): node is ts.BinaryExpression | ts.PrefixUnaryExpression | ts.PostfixUnaryExpression {
	if (
		ts.TypeGuards.isPostfixUnaryExpression(node) ||
		(ts.TypeGuards.isPrefixUnaryExpression(node) &&
			(node.getOperatorToken() === ts.SyntaxKind.PlusPlusToken ||
				node.getOperatorToken() === ts.SyntaxKind.MinusMinusToken))
	) {
		if (lhs) {
			return isIdentifierWhoseDefinitionMatchesNode(node.getOperand(), lhs);
		} else {
			return true;
		}
	} else if (ts.TypeGuards.isBinaryExpression(node) && isSetToken(node.getOperatorToken().getKind())) {
		if (lhs) {
			return isIdentifierWhoseDefinitionMatchesNode(node.getLeft(), lhs);
		} else {
			return true;
		}
	}
	return false;
}

export function appendDeclarationIfMissing(
	state: CompilerState,
	possibleExpressionStatement: ts.Node,
	compiledNode: string,
) {
	if (
		compiledNode.match(/^_d+$/) ||
		ts.TypeGuards.isExpressionStatement(skipNodesUpwards(possibleExpressionStatement))
	) {
		return "local _ = " + compiledNode;
	} else {
		return compiledNode;
	}
}

export function placeIncrementorInStatementIfExpression(
	state: CompilerState,
	incrementor: ts.Expression<ts.ts.Expression>,
	incrementorStr: string,
) {
	if (ts.TypeGuards.isExpression(incrementor)) {
		if (
			!ts.TypeGuards.isCallExpression(incrementor) &&
			!expressionModifiesVariable(incrementor) &&
			!ts.TypeGuards.isVariableDeclarationList(incrementor)
		) {
			incrementorStr = `local _ = ` + incrementorStr;
		}
	}
	return incrementorStr;
}
