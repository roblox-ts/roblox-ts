import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { ConstructorMacro, MacroList } from "TSTransformer/macros/types";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";

function wrapWeak(state: TransformState, node: ts.NewExpression, macro: ConstructorMacro) {
	return luau.create(luau.SyntaxKind.CallExpression, {
		expression: luau.globals.setmetatable,
		args: luau.list.make<luau.Expression>(macro(state, node), luau.map([[luau.strings.__mode, luau.strings.k]])),
	});
}

function isFlatMap(expression: luau.Expression): expression is luau.Array<luau.Array> {
	if (luau.isArray(expression)) {
		return luau.list.every(expression.members, member => luau.isArray(member));
	}
	return false;
}

const ArrayConstructor: ConstructorMacro = (state, node) => {
	if (node.arguments && node.arguments.length > 0) {
		const args = ensureTransformOrder(state, node.arguments);
		return luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.globals.table.create,
			args: luau.list.make(...args),
		});
	}
	return luau.array();
};

const SetConstructor: ConstructorMacro = (state, node) => {
	if (!node.arguments || node.arguments.length === 0) {
		return luau.set();
	}
	const arg = node.arguments[0];
	// spreads cause prereq array, which cannot be optimised like this
	if (ts.isArrayLiteralExpression(arg) && !arg.elements.some(ts.isSpreadElement)) {
		return luau.set(ensureTransformOrder(state, arg.elements));
	} else {
		const id = state.pushToVar(luau.set());
		const valueId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make<luau.AnyIdentifier>(luau.emptyId(), valueId),
				expression: luau.create(luau.SyntaxKind.CallExpression, {
					expression: luau.globals.ipairs,
					args: luau.list.make(transformExpression(state, arg)),
				}),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.Assignment, {
						left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: id,
							index: valueId,
						}),
						operator: "=",
						right: luau.bool(true),
					}),
				),
			}),
		);
		return id;
	}
};

const MapConstructor: ConstructorMacro = (state, node) => {
	if (!node.arguments || node.arguments.length === 0) {
		return luau.map();
	}
	const arg = node.arguments[0];
	const transformed = transformExpression(state, arg);
	if (isFlatMap(transformed)) {
		// TODO make this nicer?
		const elements = luau.list.toArray(transformed.members).map(e => {
			// non-null and type assertion because array will always have 2 members,
			// due to map constructor typing
			return [e.members.head!.value, e.members.head!.next!.value] as [luau.Expression, luau.Expression];
		});
		return luau.map(elements);
	} else {
		const id = state.pushToVar(luau.set());
		const valueId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make<luau.AnyIdentifier>(luau.emptyId(), valueId),
				expression: luau.create(luau.SyntaxKind.CallExpression, {
					expression: luau.globals.ipairs,
					args: luau.list.make(transformed),
				}),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.Assignment, {
						left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: id,
							index: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
								expression: valueId,
								index: luau.number(1),
							}),
						}),
						operator: "=",
						right: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: valueId,
							index: luau.number(2),
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
	ReadonlySetConstructor: SetConstructor,
};
