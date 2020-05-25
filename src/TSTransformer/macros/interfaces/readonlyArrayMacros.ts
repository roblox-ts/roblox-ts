import * as lua from "LuaAST";
import { MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { offset } from "TSTransformer/util/offset";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { size, makeCopyMethod, runtimeLib, makeEveryMethod, makeSomeMethod } from "TSTransformer/util/commonTrees";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";

export const READONLY_ARRAY_METHODS: MacroList<PropertyCallMacro> = {
	isEmpty: (state, node, expression) =>
		lua.create(lua.SyntaxKind.BinaryExpression, {
			left: lua.create(lua.SyntaxKind.UnaryExpression, { operator: "#", expression }),
			operator: "==",
			right: lua.number(0),
		}),

	join: (state, node, expression) => {
		const separator = node.arguments.length > 0 ? transformExpression(state, node.arguments[0]) : lua.strings[", "];
		return lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.globals.table.concat,
			args: lua.list.make(expression, separator),
		});
	},

	every: makeEveryMethod(lua.globals.ipairs, (keyId, valueId, expression) =>
		lua.list.make(valueId, offset(keyId, -1), expression),
	),

	some: makeSomeMethod(lua.globals.ipairs, (keyId, valueId, expression) =>
		lua.list.make(valueId, offset(keyId, -1), expression),
	),

	forEach: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const callbackId = state.pushToVarIfComplex(transformExpression(state, node.arguments[0]));
		const keyId = lua.tempId();
		const valueId = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.ForStatement, {
				ids: lua.list.make(keyId, valueId),
				expression: lua.create(lua.SyntaxKind.CallExpression, {
					expression: lua.globals.ipairs,
					args: lua.list.make(expression),
				}),
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.CallStatement, {
						expression: lua.create(lua.SyntaxKind.CallExpression, {
							expression: callbackId,
							args: lua.list.make(valueId, offset(keyId, -1), expression),
						}),
					}),
				),
			}),
		);

		return lua.nil();
	},

	map: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const newValueId = state.pushToVar(lua.array());
		const callbackId = state.pushToVarIfComplex(transformExpression(state, node.arguments[0]));
		const keyId = lua.tempId();
		const valueId = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.ForStatement, {
				ids: lua.list.make(keyId, valueId),
				expression: lua.create(lua.SyntaxKind.CallExpression, {
					expression: lua.globals.ipairs,
					args: lua.list.make(expression),
				}),
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.Assignment, {
						left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
							expression: newValueId,
							index: keyId,
						}),
						right: lua.create(lua.SyntaxKind.CallExpression, {
							expression: callbackId,
							args: lua.list.make(valueId, offset(keyId, -1), expression),
						}),
					}),
				),
			}),
		);

		return newValueId;
	},

	mapFiltered: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const newValueId = state.pushToVar(lua.array());
		const callbackId = state.pushToVarIfComplex(transformExpression(state, node.arguments[0]));
		const lengthId = state.pushToVar(lua.number(0));
		const keyId = lua.tempId();
		const valueId = lua.tempId();
		const resultId = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.ForStatement, {
				ids: lua.list.make(keyId, valueId),
				expression: lua.create(lua.SyntaxKind.CallExpression, {
					expression: lua.globals.ipairs,
					args: lua.list.make(expression),
				}),
				statements: lua.list.make<lua.Statement>(
					lua.create(lua.SyntaxKind.VariableDeclaration, {
						left: resultId,
						right: lua.create(lua.SyntaxKind.CallExpression, {
							expression: callbackId,
							args: lua.list.make(valueId, offset(keyId, -1), expression),
						}),
					}),
					lua.create(lua.SyntaxKind.IfStatement, {
						condition: lua.create(lua.SyntaxKind.BinaryExpression, {
							left: resultId,
							operator: "~=",
							right: lua.nil(),
						}),
						statements: lua.list.make(
							lua.create(lua.SyntaxKind.Assignment, {
								left: lengthId,
								right: lua.create(lua.SyntaxKind.BinaryExpression, {
									left: lengthId,
									operator: "+",
									right: lua.number(1),
								}),
							}),
							lua.create(lua.SyntaxKind.Assignment, {
								left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
									expression: newValueId,
									index: lengthId,
								}),
								right: resultId,
							}),
						),
						elseBody: lua.list.make(),
					}),
				),
			}),
		);

		return newValueId;
	},

	filter: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const newValueId = state.pushToVar(lua.array());
		const callbackId = state.pushToVarIfComplex(transformExpression(state, node.arguments[0]));
		const lengthId = state.pushToVar(lua.number(0));
		const keyId = lua.tempId();
		const valueId = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.ForStatement, {
				ids: lua.list.make(keyId, valueId),
				expression: lua.create(lua.SyntaxKind.CallExpression, {
					expression: lua.globals.ipairs,
					args: lua.list.make(expression),
				}),
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.IfStatement, {
						condition: lua.create(lua.SyntaxKind.BinaryExpression, {
							left: lua.create(lua.SyntaxKind.CallExpression, {
								expression: callbackId,
								args: lua.list.make(valueId, offset(keyId, -1), expression),
							}),
							operator: "==",
							right: lua.bool(true),
						}),
						statements: lua.list.make(
							lua.create(lua.SyntaxKind.Assignment, {
								left: lengthId,
								right: lua.create(lua.SyntaxKind.BinaryExpression, {
									left: lengthId,
									operator: "+",
									right: lua.number(1),
								}),
							}),
							lua.create(lua.SyntaxKind.Assignment, {
								left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
									expression: newValueId,
									index: lengthId,
								}),
								right: valueId,
							}),
						),
						elseBody: lua.list.make(),
					}),
				),
			}),
		);

		return newValueId;
	},

	reverse: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const resultId = state.pushToVar(lua.map());
		const lengthId = state.pushToVar(lua.create(lua.SyntaxKind.UnaryExpression, { operator: "#", expression }));
		const idxId = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.NumericForStatement, {
				id: idxId,
				start: lua.number(1),
				end: lengthId,
				step: undefined,
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.Assignment, {
						left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
							expression: resultId,
							index: idxId,
						}),
						right: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
							expression: convertToIndexableExpression(expression),
							index: lua.create(lua.SyntaxKind.BinaryExpression, {
								left: lengthId,
								operator: "+",
								right: lua.create(lua.SyntaxKind.BinaryExpression, {
									left: lua.number(1),
									operator: "-",
									right: idxId,
								}),
							}),
						}),
					}),
				),
			}),
		);

		return resultId;
	},
	indexOf: (state, node, expression) => {
		const nodeArgs = ensureTransformOrder(state, node.arguments);
		const findArgs = lua.list.make(expression, nodeArgs[0]);

		if (nodeArgs.length > 1) {
			lua.list.push(findArgs, offset(nodeArgs[1], 1));
		}

		return lua.create(lua.SyntaxKind.ParenthesizedExpression, {
			expression: offset(
				lua.create(lua.SyntaxKind.ParenthesizedExpression, {
					expression: lua.create(lua.SyntaxKind.BinaryExpression, {
						left: lua.create(lua.SyntaxKind.CallExpression, {
							expression: lua.globals.table.find,
							args: findArgs,
						}),
						operator: "or",
						right: lua.number(0),
					}),
				}),
				-1,
			),
		});
	},
	lastIndexOf: (state, node, expression) => {
		const nodeArgs = ensureTransformOrder(state, node.arguments);

		const startExpression = nodeArgs.length > 1 ? offset(nodeArgs[1], 1) : size(state, node, expression);

		const result = state.pushToVar(lua.number(-1));
		const iterator = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.NumericForStatement, {
				id: iterator,
				start: startExpression,
				end: lua.number(1),
				step: lua.number(-1),
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.IfStatement, {
						condition: lua.create(lua.SyntaxKind.BinaryExpression, {
							left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
								expression: convertToIndexableExpression(expression),
								index: iterator,
							}),
							operator: "==",
							right: nodeArgs[0],
						}),
						statements: lua.list.make<lua.Statement>(
							lua.create(lua.SyntaxKind.Assignment, {
								left: result,
								right: offset(iterator, -1),
							}),
							lua.create(lua.SyntaxKind.BreakStatement, {}),
						),
						elseBody: lua.list.make(),
					}),
				),
			}),
		);

		return result;
	},
	copy: makeCopyMethod(lua.globals.ipairs, (state, node, expression) => expression),

	reduce: runtimeLib("array_reduce"),
	findIndex: runtimeLib("array_findIndex"),

	find: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const callbackId = state.pushToVarIfComplex(transformExpression(state, node.arguments[0]));
		const loopId = lua.tempId();
		const valueId = lua.tempId();
		const returnId = state.pushToVar(lua.nil());

		state.prereq(
			lua.create(lua.SyntaxKind.ForStatement, {
				expression: lua.create(lua.SyntaxKind.CallExpression, {
					expression: lua.globals.ipairs,
					args: lua.list.make(expression),
				}),
				ids: lua.list.make(loopId, valueId),
				statements: lua.list.make<lua.Statement>(
					lua.create(lua.SyntaxKind.IfStatement, {
						condition: lua.create(lua.SyntaxKind.BinaryExpression, {
							left: lua.create(lua.SyntaxKind.CallExpression, {
								expression: callbackId,
								args: lua.list.make(valueId, offset(loopId, -1), expression),
							}),
							operator: "==",
							right: lua.bool(true),
						}),
						statements: lua.list.make<lua.Statement>(
							lua.create(lua.SyntaxKind.Assignment, {
								left: returnId,
								right: valueId,
							}),
							lua.create(lua.SyntaxKind.BreakStatement, {}),
						),
						elseBody: lua.list.make(),
					}),
				),
			}),
		);

		return returnId;
	},

	sort: (state, node, expression) => {
		const args = lua.list.make(expression);

		if (node.arguments.length > 0) {
			lua.list.push(args, transformExpression(state, node.arguments[0]));
		}

		return lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.globals.table.sort,
			args: args,
		});
	},
};
