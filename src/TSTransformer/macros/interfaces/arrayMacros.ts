import * as lua from "LuaAST";
import { MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { isUsedAsStatement } from "TSTransformer/util/isUsedAsStatement";
import { assert } from "Shared/util/assert";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { offset } from "TSTransformer/util/offset";

export const ARRAY_METHODS: MacroList<PropertyCallMacro> = {
	push: (state, node, expression) => {
		if (node.arguments.length === 0) {
			return lua.create(lua.SyntaxKind.UnaryExpression, { operator: "#", expression });
		}

		expression = state.pushToVarIfComplex(expression);

		const args = ensureTransformOrder(state, node.arguments);

		let sizeExp: lua.Expression = lua.create(lua.SyntaxKind.UnaryExpression, {
			operator: "#",
			expression,
		});

		if (args.length > 1) {
			sizeExp = state.pushToVar(sizeExp);
		}

		for (let i = 0; i < args.length; i++) {
			state.prereq(
				lua.create(lua.SyntaxKind.Assignment, {
					left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
						expression: convertToIndexableExpression(expression),
						index: lua.create(lua.SyntaxKind.BinaryExpression, {
							left: sizeExp,
							operator: "+",
							right: lua.number(i + 1),
						}),
					}),
					right: args[i],
				}),
			);
		}

		if (!isUsedAsStatement(node)) {
			return lua.create(lua.SyntaxKind.BinaryExpression, {
				left: sizeExp,
				operator: "+",
				right: lua.number(args.length),
			});
		} else {
			return lua.nil();
		}
	},

	pop: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		let sizeExp: lua.Expression = lua.create(lua.SyntaxKind.UnaryExpression, {
			operator: "#",
			expression,
		});

		const valueIsUsed = !isUsedAsStatement(node);
		const retValue = valueIsUsed ? lua.tempId() : lua.nil();

		if (valueIsUsed) {
			assert(lua.isTemporaryIdentifier(retValue));
			sizeExp = state.pushToVar(sizeExp);
			state.prereq(
				lua.create(lua.SyntaxKind.VariableDeclaration, {
					left: retValue,
					right: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
						expression: convertToIndexableExpression(expression),
						index: sizeExp,
					}),
				}),
			);
		}

		state.prereq(
			lua.create(lua.SyntaxKind.Assignment, {
				left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: sizeExp,
				}),
				right: lua.nil(),
			}),
		);

		return retValue;
	},

	shift: (state, node, expression) =>
		lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.globals.table.remove,
			args: lua.list.make(expression, lua.number(1)),
		}),

	unorderedRemove: (state, node, expression) => {
		const arg = transformExpression(state, node.arguments[0]);

		expression = state.pushToVarIfComplex(expression);

		const valueIsUsed = !isUsedAsStatement(node);

		const lengthId = state.pushToVar(lua.create(lua.SyntaxKind.UnaryExpression, { operator: "#", expression }));

		const valueId = lua.tempId();
		if (valueIsUsed) {
			state.prereq(
				lua.create(lua.SyntaxKind.VariableDeclaration, {
					left: valueId,
					right: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
						expression: convertToIndexableExpression(expression),
						index: offset(arg, 1),
					}),
				}),
			);
		}

		state.prereq(
			lua.create(lua.SyntaxKind.Assignment, {
				left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: offset(arg, 1),
				}),
				right: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: lengthId,
				}),
			}),
		);

		state.prereq(
			lua.create(lua.SyntaxKind.Assignment, {
				left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: lengthId,
				}),
				right: lua.nil(),
			}),
		);

		return valueIsUsed ? valueId : lua.nil();
	},
};
