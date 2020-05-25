import * as lua from "LuaAST";
import { PropertyCallMacro } from "TSTransformer/macros/types";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { offset } from "TSTransformer/util/offset";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";

function offsetArguments(args: Array<lua.Expression>, argOffsets: Array<number>) {
	const minLength = Math.min(args.length, argOffsets.length);
	for (let i = 0; i < minLength; i++) {
		const offsetValue = argOffsets[i];
		if (offsetValue !== 0) {
			const arg = args[i];
			if (lua.isNumberLiteral(arg)) {
				args[i] = lua.number(arg.value + offsetValue);
			} else {
				args[i] = offset(arg, offsetValue);
			}
		}
	}
	return args;
}

export const size: PropertyCallMacro = (state, node, expression) =>
	lua.create(lua.SyntaxKind.UnaryExpression, { operator: "#", expression });

export function runtimeLib(name: string, isStatic = false): PropertyCallMacro {
	return (state, node, expression) => {
		const args = lua.list.make(...ensureTransformOrder(state, node.arguments));
		if (!isStatic) {
			lua.list.unshift(args, expression);
		}
		return lua.create(lua.SyntaxKind.CallExpression, {
			expression: state.TS(name),
			args,
		});
	};
}

export function wrapParenthesesIfBinary(expression: lua.Expression) {
	if (lua.isBinaryExpression(expression)) {
		return lua.create(lua.SyntaxKind.ParenthesizedExpression, { expression });
	}
	return expression;
}

export function makeEveryOrSomeMethod(
	iterator: lua.Identifier,
	callbackArgsListMaker: (
		keyId: lua.TemporaryIdentifier,
		valueId: lua.TemporaryIdentifier,
		expression: lua.Expression,
	) => lua.List<lua.Expression>,
	initialState: boolean,
): PropertyCallMacro {
	return (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const resultId = state.pushToVar(lua.bool(initialState));
		const callbackId = state.pushToVarIfComplex(transformExpression(state, node.arguments[0]));

		const keyId = lua.tempId();
		const valueId = lua.tempId();

		const callCallback = lua.create(lua.SyntaxKind.CallExpression, {
			expression: callbackId,
			args: callbackArgsListMaker(keyId, valueId, expression),
		});
		state.prereq(
			lua.create(lua.SyntaxKind.ForStatement, {
				ids: lua.list.make(keyId, valueId),
				expression: lua.create(lua.SyntaxKind.CallExpression, {
					expression: iterator,
					args: lua.list.make(expression),
				}),
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.IfStatement, {
						condition: initialState
							? lua.create(lua.SyntaxKind.UnaryExpression, {
									operator: "not",
									expression: callCallback,
							  })
							: callCallback,
						statements: lua.list.make<lua.Statement>(
							lua.create(lua.SyntaxKind.Assignment, {
								left: resultId,
								right: lua.bool(!initialState),
							}),
							lua.create(lua.SyntaxKind.BreakStatement, {}),
						),
						elseBody: lua.list.make(),
					}),
				),
			}),
		);

		return resultId;
	};
}

export function makeSomeMethod(
	iterator: lua.Identifier,
	callbackArgsListMaker: (
		keyId: lua.TemporaryIdentifier,
		valueId: lua.TemporaryIdentifier,
		expression: lua.Expression,
	) => lua.List<lua.Expression>,
): PropertyCallMacro {
	return makeEveryOrSomeMethod(iterator, callbackArgsListMaker, false);
}

export function makeEveryMethod(
	iterator: lua.Identifier,
	callbackArgsListMaker: (
		keyId: lua.TemporaryIdentifier,
		valueId: lua.TemporaryIdentifier,
		expression: lua.Expression,
	) => lua.List<lua.Expression>,
): PropertyCallMacro {
	return makeEveryOrSomeMethod(iterator, callbackArgsListMaker, true);
}

export function makeKeysValuesEntriesMethod(
	loopIds: Array<lua.AnyIdentifier>,
	generator: (...loopIds: Array<lua.AnyIdentifier>) => lua.Expression,
): PropertyCallMacro {
	return (state, node, expression) => {
		const valuesId = state.pushToVar(lua.array());

		const size = lua.create(lua.SyntaxKind.UnaryExpression, {
			operator: "#",
			expression: valuesId,
		});

		state.prereq(
			lua.create(lua.SyntaxKind.ForStatement, {
				ids: lua.list.make(...loopIds),
				expression: lua.create(lua.SyntaxKind.CallExpression, {
					expression: lua.globals.pairs,
					args: lua.list.make(transformExpression(state, node.arguments[0])),
				}),
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.Assignment, {
						left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
							expression: convertToIndexableExpression(valuesId),
							index: lua.create(lua.SyntaxKind.BinaryExpression, {
								left: size,
								operator: "+",
								right: lua.number(1),
							}),
						}),
						right: generator(...loopIds),
					}),
				),
			}),
		);

		return valuesId;
	};
}

export function stringMatchCallback(pattern: string): PropertyCallMacro {
	return (state, node, expression) =>
		lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.globals.string.match,
			args: lua.list.make(expression, lua.string(pattern)),
		});
}

export function makeStringCallback(
	strCallback: lua.PropertyAccessExpression,
	argOffsets: Array<number> = [],
): PropertyCallMacro {
	return (state, node, expression) => {
		const args = offsetArguments(ensureTransformOrder(state, node.arguments), argOffsets);
		return lua.create(lua.SyntaxKind.CallExpression, {
			expression: strCallback,
			args: lua.list.make(expression, ...args),
		});
	};
}

export function makeCopyMethod(iterator: lua.Identifier, makeExpression: PropertyCallMacro): PropertyCallMacro {
	return (state, node, expression) => {
		const arrayCopyId = state.pushToVar(lua.map());
		const valueId = lua.tempId();
		const keyId = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.ForStatement, {
				ids: lua.list.make(keyId, valueId),
				expression: lua.create(lua.SyntaxKind.CallExpression, {
					expression: iterator,
					args: lua.list.make(makeExpression(state, node, expression)),
				}),
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.Assignment, {
						left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
							expression: arrayCopyId,
							index: keyId,
						}),
						right: valueId,
					}),
				),
			}),
		);

		return arrayCopyId;
	};
}
