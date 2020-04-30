import * as lua from "LuaAST";
import { ConstructorMacro, MacroList } from "TSTransformer/macros/types";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { TransformState } from "TSTransformer/TransformState";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { pushToVar } from "TSTransformer/util/pushToVar";
import ts from "byots";

function wrapWeak(state: TransformState, node: ts.NewExpression, macro: ConstructorMacro) {
	return lua.create(lua.SyntaxKind.CallExpression, {
		expression: lua.globals.setmetatable,
		args: lua.list.make<lua.Expression>(macro(state, node), lua.map([[lua.string("__mode"), lua.string("k")]])),
	});
}

function isFlatMap(expression: lua.Expression): expression is lua.Array {
	if (lua.isArray(expression)) {
		for (const member of lua.list.toArray(expression.members)) {
			if (!lua.isArray(member)) {
				return false;
			}
		}
		return true;
	}
	return false;
}

export const CONSTRUCTOR_MACROS: MacroList<ConstructorMacro> = {
	ArrayConstructor: (state, node) => {
		if (node.arguments && node.arguments.length > 0) {
			const args = ensureTransformOrder(state, node.arguments);
			return lua.create(lua.SyntaxKind.CallExpression, {
				expression: lua.globals.table.create,
				args: lua.list.make(...args),
			});
		}
		return lua.array();
	},

	SetConstructor: (state, node) => {
		if (!node.arguments || node.arguments.length === 0) {
			return lua.set();
		}
		const arg = node.arguments[0];
		if (ts.isArrayLiteralExpression(arg)) {
			return lua.set(ensureTransformOrder(state, arg.elements));
		} else {
			const id = pushToVar(state, lua.set());
			const valueId = lua.tempId();
			state.prereq(
				lua.create(lua.SyntaxKind.ForStatement, {
					ids: lua.list.make<lua.AnyIdentifier>(lua.emptyId(), valueId),
					expression: lua.create(lua.SyntaxKind.CallExpression, {
						expression: lua.globals.ipairs,
						args: lua.list.make(transformExpression(state, arg)),
					}),
					statements: lua.list.make(
						lua.create(lua.SyntaxKind.Assignment, {
							left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
								expression: id,
								index: valueId,
							}),
							right: lua.bool(true),
						}),
					),
				}),
			);
			return id;
		}
	},

	MapConstructor: (state, node) => {
		if (!node.arguments || node.arguments.length === 0) {
			return lua.map();
		}
		const arg = node.arguments[0];
		const transformed = transformExpression(state, arg);
		if (isFlatMap(transformed)) {
			// TODO make this nicer?
			const elements = lua.list.toArray(transformed.members).map(element => {
				const e = element as lua.Array;
				return [e.members.head?.value, e.members.head?.next?.value] as [lua.Expression, lua.Expression];
			});
			return lua.map(elements);
		} else {
			const id = pushToVar(state, lua.set());
			const keyId = lua.tempId();
			const valueId = lua.tempId();
			state.prereq(
				lua.create(lua.SyntaxKind.ForStatement, {
					ids: lua.list.make<lua.AnyIdentifier>(keyId, valueId),
					expression: lua.create(lua.SyntaxKind.CallExpression, {
						expression: lua.globals.ipairs,
						args: lua.list.make(transformed),
					}),
					statements: lua.list.make(
						lua.create(lua.SyntaxKind.Assignment, {
							left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
								expression: id,
								index: keyId,
							}),
							right: valueId,
						}),
					),
				}),
			);
			return id;
		}
	},

	WeakSetConstructor: (state, node) => wrapWeak(state, node, CONSTRUCTOR_MACROS.SetConstructor),
	WeakMapConstructor: (state, node) => wrapWeak(state, node, CONSTRUCTOR_MACROS.MapConstructor),
};
