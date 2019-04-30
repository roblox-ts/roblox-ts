import * as ts from "ts-morph";
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
import { inheritsFrom, isArrayType, isNumberType, isTupleReturnTypeCall } from "../typeUtilities";
import { safeLuaIndex } from "../utility";

export function compilePropertyAccessExpression(state: CompilerState, node: ts.PropertyAccessExpression) {
	const exp = node.getExpression();
	const expStr = compileExpression(state, exp);
	const propertyStr = node.getName();

	const propertyAccessExpressionType = getPropertyAccessExpressionType(state, node, node);

	if (
		(propertyAccessExpressionType === PropertyCallExpType.String ||
			propertyAccessExpressionType === PropertyCallExpType.Array) &&
		propertyStr === "length"
	) {
		return `(#${expStr})`;
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

	return `${expStr}.${propertyStr}`;
}

export function compileElementAccessExpression(state: CompilerState, node: ts.ElementAccessExpression) {
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

	if (ts.TypeGuards.isCallExpression(expNode) && isTupleReturnTypeCall(expNode)) {
		const expStr = compileCallExpression(state, expNode, true);
		checkNonAny(expNode);
		checkNonAny(argExp);
		if (argExpStr === "1") {
			return `(${expStr})`;
		} else {
			return `(select(${argExpStr}, ${expStr}))`;
		}
	} else {
		const expStr = compileExpression(state, expNode);
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
		if (isArrayLiteral) {
			return `(${expStr})[${argExpStr}]`;
		} else {
			return `${expStr}[${argExpStr}]`;
		}
	}
}
