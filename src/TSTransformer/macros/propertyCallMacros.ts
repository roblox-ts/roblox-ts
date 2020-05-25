import * as lua from "LuaAST";
import { MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { wrapParenthesesIfBinary } from "TSTransformer/util/commonTrees";
import { assert } from "Shared/util/assert";
import { OBJECT_METHODS } from "TSTransformer/macros/interfaces/objectMacros";
import { MAP_METHODS } from "TSTransformer/macros/interfaces/mapMacros";
import { READONLY_MAP_METHODS } from "TSTransformer/macros/interfaces/readonlyMapMacros";
import { STRING_CALLBACKS } from "TSTransformer/macros/interfaces/stringMacros";
import { ARRAY_LIKE_METHODS } from "TSTransformer/macros/interfaces/arrayLikeMacros";
import { READONLY_ARRAY_METHODS } from "TSTransformer/macros/interfaces/readonlyArrayMacros";
import { ARRAY_METHODS } from "TSTransformer/macros/interfaces/arrayMacros";
import { READONLY_SET_METHODS } from "TSTransformer/macros/interfaces/readonlySetMacros";
import { PROMISE_METHODS } from "TSTransformer/macros/interfaces/promiseMacros";
import { SET_METHODS } from "TSTransformer/macros/interfaces/setMacros";

function makeMathMethod(operator: lua.BinaryOperator): PropertyCallMacro {
	return (state, node, expression) => {
		const { expression: right, statements } = state.capture(() => transformExpression(state, node.arguments[0]));
		const left = lua.list.isEmpty(statements) ? expression : state.pushToVar(expression);
		state.prereqList(statements);
		return lua.create(lua.SyntaxKind.BinaryExpression, {
			left: wrapParenthesesIfBinary(left),
			operator,
			right: wrapParenthesesIfBinary(right),
		});
	};
}

const OPERATOR_TO_NAME_MAP = new Map<lua.BinaryOperator, "add" | "sub" | "mul" | "div">([
	["+", "add"],
	["-", "sub"],
	["*", "mul"],
	["/", "div"],
]);

function makeMathSet(...operators: Array<lua.BinaryOperator>) {
	const result: { [index: string]: PropertyCallMacro } = {};
	for (const operator of operators) {
		const methodName = OPERATOR_TO_NAME_MAP.get(operator);
		assert(methodName);
		result[methodName] = makeMathMethod(operator);
	}
	return result;
}

export const PROPERTY_CALL_MACROS: { [className: string]: MacroList<PropertyCallMacro> } = {
	// math classes
	CFrame: makeMathSet("+", "-", "*"),
	UDim: makeMathSet("+", "-"),
	UDim2: makeMathSet("+", "-"),
	Vector2: makeMathSet("+", "-", "*", "/"),
	Vector2int16: makeMathSet("+", "-", "*", "/"),
	Vector3: makeMathSet("+", "-", "*", "/"),
	Vector3int16: makeMathSet("+", "-", "*", "/"),

	String: STRING_CALLBACKS,
	ArrayLike: ARRAY_LIKE_METHODS,
	ReadonlyArray: READONLY_ARRAY_METHODS,
	Array: ARRAY_METHODS,
	ReadonlySet: READONLY_SET_METHODS,
	Set: SET_METHODS,
	ReadonlyMap: READONLY_MAP_METHODS,
	Map: MAP_METHODS,
	Promise: PROMISE_METHODS,
	ObjectConstructor: OBJECT_METHODS,
};

// comment logic

function header(text: string) {
	return lua.comment(`▼ ${text} ▼`);
}

function footer(text: string) {
	return lua.comment(`▲ ${text} ▲`);
}

function wasExpressionPushed(statements: lua.List<lua.Statement>, expression: lua.Expression) {
	if (statements.head !== undefined) {
		const firstStatement = statements.head.value;
		if (lua.isVariableDeclaration(firstStatement)) {
			if (!lua.list.isList(firstStatement.left) && lua.isTemporaryIdentifier(firstStatement.left)) {
				if (firstStatement.right === expression) {
					return true;
				}
			}
		}
	}
	return false;
}

function wrapComments(methodName: string, callback: PropertyCallMacro): PropertyCallMacro {
	return (state, callNode, callExp) => {
		const { expression, statements } = state.capture(() => callback(state, callNode, callExp));

		let size = lua.list.size(statements);
		if (size > 0) {
			// detect the case of `expression = state.pushToVarIfComplex(expression);` and put header after
			const wasPushed = wasExpressionPushed(statements, callExp);
			let pushStatement: lua.Statement | undefined;
			if (wasPushed) {
				pushStatement = lua.list.shift(statements);
				size--;
			}
			if (size > 0) {
				lua.list.unshift(statements, header(methodName));
				if (wasPushed && pushStatement) {
					lua.list.unshift(statements, pushStatement);
				}
				lua.list.push(statements, footer(methodName));
			} else {
				if (wasPushed && pushStatement) {
					lua.list.unshift(statements, pushStatement);
				}
			}
		}

		state.prereqList(statements);
		return expression;
	};
}

// apply comment wrapping
for (const [className, macroList] of Object.entries(PROPERTY_CALL_MACROS)) {
	for (const [methodName, macro] of Object.entries(macroList)) {
		macroList[methodName] = wrapComments(`${className}.${methodName}`, macro);
	}
}
