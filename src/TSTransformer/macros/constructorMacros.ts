import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { ConstructorMacro, MacroList } from "TSTransformer/macros/types";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";

function wrapWeak(state: TransformState, node: ts.NewExpression, macro: ConstructorMacro) {
	return lua.create(lua.SyntaxKind.CallExpression, {
		expression: lua.globals.setmetatable,
		args: lua.list.make<lua.Expression>(macro(state, node), lua.map([[lua.strings.__mode, lua.strings.k]])),
	});
}

function isFlatMap(expression: lua.Expression): expression is lua.Array<lua.Array<lua.Expression>> {
	if (lua.isArray(expression)) {
		return lua.list.every(expression.members, member => lua.isArray(member));
	}
	return false;
}

const ArrayConstructor: ConstructorMacro = (state, node) => {
	if (node.arguments && node.arguments.length > 0) {
		const args = ensureTransformOrder(state, node.arguments);
		return lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.globals.table.create,
			args: lua.list.make(...args),
		});
	}
	return lua.array();
};

const SetConstructor: ConstructorMacro = (state, node) => {
	if (!node.arguments || node.arguments.length === 0) {
		return lua.set();
	}
	const arg = node.arguments[0];
	if (ts.isArrayLiteralExpression(arg)) {
		return lua.set(ensureTransformOrder(state, arg.elements));
	} else {
		const id = state.pushToVar(lua.set());
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
};

const MapConstructor: ConstructorMacro = (state, node) => {
	if (!node.arguments || node.arguments.length === 0) {
		return lua.map();
	}
	const arg = node.arguments[0];
	const transformed = transformExpression(state, arg);
	if (isFlatMap(transformed)) {
		// TODO make this nicer?
		const elements = lua.list.toArray(transformed.members).map(e => {
			// Non-null and type assertion because array will always have 2 members,
			// Due to map constructor typing.
			return [e.members.head!.value, e.members.head!.next!.value] as [lua.Expression, lua.Expression];
		});
		return lua.map(elements);
	} else {
		const id = state.pushToVar(lua.set());
		const valueId = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.ForStatement, {
				ids: lua.list.make<lua.AnyIdentifier>(lua.emptyId(), valueId),
				expression: lua.create(lua.SyntaxKind.CallExpression, {
					expression: lua.globals.ipairs,
					args: lua.list.make(transformed),
				}),
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.Assignment, {
						left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
							expression: id,
							index: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
								expression: valueId,
								index: lua.number(1),
							}),
						}),
						right: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
							expression: valueId,
							index: lua.number(2),
						}),
					}),
				),
			}),
		);
		return id;
	}
};

export const CONSTRUCTOR_MACROS: MacroList<ConstructorMacro> = {
	ArrayConstructor,
	SetConstructor,
	MapConstructor,
	WeakSetConstructor: (state, node) => wrapWeak(state, node, SetConstructor),
	WeakMapConstructor: (state, node) => wrapWeak(state, node, MapConstructor),
	ReadonlyMapConstructor: MapConstructor,
	ReadonlySetConstructor: MapConstructor,
};
