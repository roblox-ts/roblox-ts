import * as ts from "ts-morph";
import {
	transpileArrayLiteralExpression,
	transpileAwaitExpression,
	transpileBinaryExpression,
	transpileBooleanLiteral,
	transpileCallExpression,
	transpileClassExpression,
	transpileConditionalExpression,
	transpileElementAccessExpression,
	transpileFunctionExpression,
	transpileIdentifier,
	transpileJsxElement,
	transpileJsxSelfClosingElement,
	transpileNewExpression,
	transpileNumericLiteral,
	transpileObjectLiteralExpression,
	transpileParenthesizedExpression,
	transpilePostfixUnaryExpression,
	transpilePrefixUnaryExpression,
	transpilePropertyAccessExpression,
	transpileSpreadElement,
	transpileStringLiteral,
	transpileTemplateExpression,
	transpileTypeOfExpression,
} from ".";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
import { isSetToken } from "./binary";

export function transpileExpression(state: TranspilerState, node: ts.Expression): string {
	if (ts.TypeGuards.isStringLiteral(node) || ts.TypeGuards.isNoSubstitutionTemplateLiteral(node)) {
		return transpileStringLiteral(state, node);
	} else if (ts.TypeGuards.isNumericLiteral(node)) {
		return transpileNumericLiteral(state, node);
	} else if (ts.TypeGuards.isBooleanLiteral(node)) {
		return transpileBooleanLiteral(state, node);
	} else if (ts.TypeGuards.isArrayLiteralExpression(node)) {
		return transpileArrayLiteralExpression(state, node);
	} else if (ts.TypeGuards.isObjectLiteralExpression(node)) {
		return transpileObjectLiteralExpression(state, node);
	} else if (ts.TypeGuards.isFunctionExpression(node) || ts.TypeGuards.isArrowFunction(node)) {
		return transpileFunctionExpression(state, node);
	} else if (ts.TypeGuards.isCallExpression(node)) {
		return transpileCallExpression(state, node);
	} else if (ts.TypeGuards.isIdentifier(node)) {
		return transpileIdentifier(state, node);
	} else if (ts.TypeGuards.isBinaryExpression(node)) {
		return transpileBinaryExpression(state, node);
	} else if (ts.TypeGuards.isPrefixUnaryExpression(node)) {
		return transpilePrefixUnaryExpression(state, node);
	} else if (ts.TypeGuards.isPostfixUnaryExpression(node)) {
		return transpilePostfixUnaryExpression(state, node);
	} else if (ts.TypeGuards.isPropertyAccessExpression(node)) {
		return transpilePropertyAccessExpression(state, node);
	} else if (ts.TypeGuards.isNewExpression(node)) {
		return transpileNewExpression(state, node);
	} else if (ts.TypeGuards.isParenthesizedExpression(node)) {
		return transpileParenthesizedExpression(state, node);
	} else if (ts.TypeGuards.isTemplateExpression(node)) {
		return transpileTemplateExpression(state, node);
	} else if (ts.TypeGuards.isElementAccessExpression(node)) {
		return transpileElementAccessExpression(state, node);
	} else if (ts.TypeGuards.isAwaitExpression(node)) {
		return transpileAwaitExpression(state, node);
	} else if (ts.TypeGuards.isConditionalExpression(node)) {
		return transpileConditionalExpression(state, node);
	} else if (ts.TypeGuards.isTypeOfExpression(node)) {
		return transpileTypeOfExpression(state, node);
	} else if (ts.TypeGuards.isJsxExpression(node)) {
		return transpileExpression(state, node.getExpressionOrThrow());
	} else if (ts.TypeGuards.isJsxSelfClosingElement(node)) {
		return transpileJsxSelfClosingElement(state, node);
	} else if (ts.TypeGuards.isJsxElement(node)) {
		return transpileJsxElement(state, node);
	} else if (ts.TypeGuards.isSpreadElement(node)) {
		return transpileSpreadElement(state, node);
	} else if (ts.TypeGuards.isClassExpression(node)) {
		return transpileClassExpression(state, node);
	} else if (ts.TypeGuards.isOmittedExpression(node)) {
		return "nil";
	} else if (ts.TypeGuards.isThisExpression(node)) {
		if (
			!node.getFirstAncestorByKind(ts.SyntaxKind.ClassDeclaration) &&
			!node.getFirstAncestorByKind(ts.SyntaxKind.ObjectLiteralExpression)
		) {
			throw new TranspilerError(
				"'this' may only be used inside a class definition or object literal",
				node,
				TranspilerErrorType.NoThisOutsideClass,
			);
		}
		return "self";
	} else if (ts.TypeGuards.isSuperExpression(node)) {
		return "super";
	} else if (
		ts.TypeGuards.isAsExpression(node) ||
		ts.TypeGuards.isTypeAssertion(node) ||
		ts.TypeGuards.isNonNullExpression(node)
	) {
		return transpileExpression(state, node.getExpression());
	} else if (ts.TypeGuards.isNullLiteral(node)) {
		throw new TranspilerError(
			"'null' is not supported! Use 'undefined' instead.",
			node,
			TranspilerErrorType.NoNull,
		);
	} else if (ts.TypeGuards.isImportExpression(node)) {
		throw new TranspilerError(
			"Dynamic import expressions are not supported! Use 'require()' instead and assert the type.",
			node,
			TranspilerErrorType.NoDynamicImport,
		);
	} else {
		const kindName = node.getKindName();
		throw new TranspilerError(`Bad expression! (${kindName})`, node, TranspilerErrorType.BadExpression);
	}
}

export function transpileExpressionStatement(state: TranspilerState, node: ts.ExpressionStatement) {
	// big set of rules for expression statements
	const expression = node.getExpression();

	if (ts.TypeGuards.isCallExpression(expression)) {
		return state.indent + transpileCallExpression(state, expression, true) + ";\n";
	}

	if (
		!ts.TypeGuards.isNewExpression(expression) &&
		!ts.TypeGuards.isAwaitExpression(expression) &&
		!ts.TypeGuards.isPostfixUnaryExpression(expression) &&
		!(
			ts.TypeGuards.isPrefixUnaryExpression(expression) &&
			(expression.getOperatorToken() === ts.SyntaxKind.PlusPlusToken ||
				expression.getOperatorToken() === ts.SyntaxKind.MinusMinusToken)
		) &&
		!(ts.TypeGuards.isBinaryExpression(expression) && isSetToken(expression.getOperatorToken().getKind()))
	) {
		const expStr = transpileExpression(state, expression);
		return state.indent + `local _ = ${expStr};\n`;
	}
	return state.indent + transpileExpression(state, expression) + ";\n";
}
