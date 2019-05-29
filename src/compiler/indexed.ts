import ts from "ts-morph";
import {
	checkApiAccess,
	checkNonAny,
	compileCallExpression,
	compileExpression,
	compileNumericLiteral,
	getPropertyAccessExpressionType,
	PropertyCallExpType,
} from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import {
	inheritsFrom,
	isArrayType,
	isMapType,
	isNumberType,
	isSetType,
	isStringType,
	isTupleReturnTypeCall,
} from "../typeUtilities";
import { removeBalancedParenthesisFromStringBorders, safeLuaIndex } from "../utility";

export function isIdentifierDefinedInConst(exp: ts.Identifier) {
	// I have no idea why, but getDefinitionNodes() cannot replace this
	for (const def of exp.getDefinitions()) {
		const definition = def.getNode().getFirstAncestorByKind(ts.SyntaxKind.VariableStatement);
		if (definition && definition.getDeclarationKind() === ts.VariableDeclarationKind.Const) {
			return true;
		}
	}
	return false;
}

export function isIdentifierDefinedInExportLet(exp: ts.Identifier) {
	// I have no idea why, but getDefinitionNodes() cannot replace this
	for (const def of exp.getDefinitions()) {
		const definition = def.getNode().getFirstAncestorByKind(ts.SyntaxKind.VariableStatement);
		if (
			definition &&
			definition.hasExportKeyword() &&
			definition.getDeclarationKind() === ts.VariableDeclarationKind.Let
		) {
			return true;
		}
	}
	return false;
}

/**
 * Gets the writable operand name, meaning the code should be able to do `returnValue = x;`
 * The rule in this case is that if there is a depth of 3 or more, e.g. `Foo.Bar.i`, we push `Foo.Bar`
 */
export function getWritableOperandName(state: CompilerState, operand: ts.Expression) {
	if (ts.TypeGuards.isPropertyAccessExpression(operand)) {
		const child = operand.getChildAtIndex(0);

		if (
			ts.TypeGuards.isPropertyAccessExpression(child) ||
			(ts.TypeGuards.isIdentifier(child) && isIdentifierDefinedInExportLet(child))
		) {
			const expression = operand.getExpression();
			const opExpStr = compileExpression(state, expression);
			const propertyStr = operand.getName();
			const id = state.pushPrecedingStatementToReuseableId(operand, opExpStr);
			return { expStr: `${id}.${propertyStr}`, isIdentifier: false };
		}
	}

	return {
		expStr: compileExpression(state, operand),
		isIdentifier: ts.TypeGuards.isIdentifier(operand) && !isIdentifierDefinedInExportLet(operand),
	};
}

/**
 * Similar to getWritableOperandName, but should push anything with any depth. This includes export let vars.
 */
export function getReadableExpressionName(
	state: CompilerState,
	exp: ts.Expression,
	expStr = compileExpression(state, exp),
) {
	if (
		expStr.match(/^\(*_\d+\)*$/) ||
		(ts.TypeGuards.isIdentifier(exp) && !isIdentifierDefinedInExportLet(exp)) ||
		// We know that new Sets and Maps are already ALWAYS pushed
		(ts.TypeGuards.isNewExpression(exp) && (isSetType(exp.getType()) || isMapType(exp.getType())))
	) {
		return expStr;
	} else {
		return state.pushPrecedingStatementToReuseableId(exp, expStr);
	}
}

export function compilePropertyAccessExpression(state: CompilerState, node: ts.PropertyAccessExpression) {
	const exp = node.getExpression();
	const expStr = compileExpression(state, exp);
	const propertyStr = node.getName();
	const expType = exp.getType();
	const propertyAccessExpressionType = getPropertyAccessExpressionType(state, node);

	if ((isArrayType(expType) || isStringType(expType)) && propertyStr === "length") {
		return `#(${removeBalancedParenthesisFromStringBorders(expStr)})`;
	} else if (propertyAccessExpressionType !== PropertyCallExpType.None) {
		throw new CompilerError(
			`Invalid property access! Cannot index non-member "${propertyStr}" (a roblox-ts macro function)`,
			node,
			CompilerErrorType.InvalidMacroIndex,
		);
	}

	const nameNode = node.getNameNode();
	checkApiAccess(state, nameNode);

	checkNonAny(exp);
	checkNonAny(nameNode);

	if (ts.TypeGuards.isSuperExpression(exp)) {
		const baseClassName = exp
			.getType()
			.getSymbolOrThrow()
			.getName();
		const indexA = safeLuaIndex(`${baseClassName}._getters`, propertyStr);
		const indexB = safeLuaIndex("self", propertyStr);
		return `(${indexA} and function(self) return ${indexA}(self) end or function() return ${indexB} end)(self)`;
	}

	const symbol = exp.getType().getSymbol();
	if (symbol) {
		const valDec = symbol.getValueDeclaration();
		if (valDec) {
			if (
				ts.TypeGuards.isFunctionDeclaration(valDec) ||
				ts.TypeGuards.isArrowFunction(valDec) ||
				ts.TypeGuards.isFunctionExpression(valDec) ||
				ts.TypeGuards.isMethodDeclaration(valDec)
			) {
				throw new CompilerError("Cannot index a function value!", node, CompilerErrorType.NoFunctionIndex);
			} else if (ts.TypeGuards.isEnumDeclaration(valDec)) {
				if (valDec.isConstEnum()) {
					const value = valDec.getMemberOrThrow(propertyStr).getValue();
					if (typeof value === "number") {
						return `${value}`;
					} else if (typeof value === "string") {
						return `"${value}"`;
					}
				}
			} else if (ts.TypeGuards.isClassDeclaration(valDec)) {
				if (propertyStr === "prototype") {
					throw new CompilerError(
						"Class prototypes are not supported!",
						node,
						CompilerErrorType.NoClassPrototype,
					);
				}
			}
		}
	}

	return expStr === "TS.Symbol" ? `${expStr}_${propertyStr}` : `${expStr}.${propertyStr}`;
}

export function compileElementAccessBracketExpression(state: CompilerState, node: ts.ElementAccessExpression) {
	const expNode = node.getExpression();
	const expType = expNode.getType();
	const argExp = node.getArgumentExpressionOrThrow();

	let addOne = false;
	if (isNumberType(argExp.getType())) {
		if (isArrayType(expType)) {
			addOne = true;
		} else if (
			ts.TypeGuards.isCallExpression(expNode) &&
			(isTupleReturnTypeCall(expNode) || isArrayType(expNode.getReturnType()))
		) {
			addOne = true;
		}
	}

	let offset = "";
	let argExpStr: string;
	if (ts.TypeGuards.isNumericLiteral(argExp) && argExp.getText().indexOf("e") === -1) {
		let value = Number(compileNumericLiteral(state, argExp));
		if (addOne) {
			value++;
		}
		argExpStr = value.toString();
	} else {
		if (addOne) {
			offset = " + 1";
		}
		argExpStr = compileExpression(state, argExp) + offset;
	}

	return argExpStr;
}

export function compileElementAccessDataTypeExpression(state: CompilerState, node: ts.ElementAccessExpression) {
	const expNode = node.getExpression();
	const argExp = node.getArgumentExpressionOrThrow();

	if (ts.TypeGuards.isCallExpression(expNode) && isTupleReturnTypeCall(expNode)) {
		const expStr = compileCallExpression(state, expNode, true);
		checkNonAny(expNode);
		checkNonAny(argExp);
		return (argExpStr: string) => (argExpStr === "1" ? `(${expStr})` : `(select(${argExpStr}, ${expStr}))`);
	} else {
		checkNonAny(expNode);
		checkNonAny(argExp);
		let isArrayLiteral = false;
		if (ts.TypeGuards.isArrayLiteralExpression(expNode)) {
			isArrayLiteral = true;
		} else if (ts.TypeGuards.isNewExpression(expNode)) {
			const subExpNode = expNode.getExpression();
			const subExpType = subExpNode.getType();
			if (subExpType.isObject() && inheritsFrom(subExpType, "ArrayConstructor")) {
				isArrayLiteral = true;
			}
		}
		const expStr = compileExpression(state, expNode);

		if (isArrayLiteral) {
			return (argExpStr: string) => `(${expStr})[${argExpStr}]`;
		} else {
			return (argExpStr: string) => `${expStr}[${argExpStr}]`;
		}
	}
}

export function compileElementAccessExpression(state: CompilerState, node: ts.ElementAccessExpression) {
	return compileElementAccessDataTypeExpression(state, node)(compileElementAccessBracketExpression(state, node));
}
