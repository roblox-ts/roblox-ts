import * as ts from "ts-morph";
import {
	checkApiAccess,
	checkNonAny,
	getPropertyAccessExpressionType,
	PropertyCallExpType,
	transpileCallExpression,
	transpileExpression,
} from ".";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
import { inheritsFrom, isArrayType, isNumberType, isTupleType } from "../typeUtilities";
import { safeLuaIndex } from "../utility";

export function transpilePropertyAccessExpression(state: TranspilerState, node: ts.PropertyAccessExpression) {
	const exp = node.getExpression();
	const expStr = transpileExpression(state, exp);
	const propertyStr = node.getName();

	const propertyAccessExpressionType = getPropertyAccessExpressionType(state, node, node);

	if (
		propertyAccessExpressionType === PropertyCallExpType.String ||
		(propertyAccessExpressionType === PropertyCallExpType.Array && propertyStr === "length")
	) {
		return `(#${expStr})`;
	} else if (propertyAccessExpressionType !== PropertyCallExpType.None) {
		throw new TranspilerError(
			`Invalid property access! Cannot index non-member "${propertyStr}" (a roblox-ts macro function)`,
			node,
			TranspilerErrorType.InvalidMacroIndex,
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
				throw new TranspilerError("Cannot index a function value!", node, TranspilerErrorType.NoFunctionIndex);
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
					throw new TranspilerError(
						"Class prototypes are not supported!",
						node,
						TranspilerErrorType.NoClassPrototype,
					);
				}
			}
		}
	}

	return `${expStr}.${propertyStr}`;
}

export function transpileElementAccessExpression(state: TranspilerState, node: ts.ElementAccessExpression) {
	const expNode = node.getExpression();
	const expType = expNode.getType();
	const argExp = node.getArgumentExpressionOrThrow();

	let addOne = false;
	if (isNumberType(argExp.getType())) {
		if (isTupleType(expType) || isArrayType(expType)) {
			addOne = true;
		} else if (ts.TypeGuards.isCallExpression(expNode)) {
			const returnType = expNode.getReturnType();
			if (isArrayType(returnType) || isTupleType(returnType)) {
				addOne = true;
			}
		}
	}

	let offset = "";
	let argExpStr: string;
	if (ts.TypeGuards.isNumericLiteral(argExp) && argExp.getText().indexOf("e") === -1) {
		let value = argExp.getLiteralValue();
		if (addOne) {
			value++;
		}
		argExpStr = value.toString();
	} else {
		if (addOne) {
			offset = " + 1";
		}
		argExpStr = transpileExpression(state, argExp) + offset;
	}

	if (ts.TypeGuards.isCallExpression(expNode) && isTupleType(expNode.getReturnType())) {
		const expStr = transpileCallExpression(state, expNode, true);
		checkNonAny(expNode);
		checkNonAny(argExp);
		return `(select(${argExpStr}, ${expStr}))`;
	} else {
		const expStr = transpileExpression(state, expNode);
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
