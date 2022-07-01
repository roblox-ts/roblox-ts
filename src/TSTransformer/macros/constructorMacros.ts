import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { ConstructorMacro, MacroList } from "TSTransformer/macros/types";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import ts from "typescript";

function wrapWeak(state: TransformState, node: ts.NewExpression, macro: ConstructorMacro) {
	return luau.call(luau.globals.setmetatable, [
		macro(state, node),
		luau.map([[luau.strings.__mode, luau.strings.k]]),
	]);
}

const ArrayConstructor: ConstructorMacro = (state, node) => {
	if (node.arguments && node.arguments.length > 0) {
		const args = ensureTransformOrder(state, node.arguments);
		return luau.call(luau.globals.table.create, args);
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
		const id = state.pushToVar(luau.set(), "set");
		const valueId = luau.tempId("v");
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make<luau.AnyIdentifier>(luau.tempId(), valueId),
				expression: transformExpression(state, arg),
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
	if (luau.isArray(transformed) && luau.list.every(transformed.members, member => luau.isArray(member))) {
		const elements = luau.list.toArray(transformed.members).map(e => {
			// non-null and type assertion because array will always have 2 members,
			// due to map constructor typing
			assert(luau.isArray(e) && luau.list.isNonEmpty(e.members));
			return [e.members.head.value, e.members.head.next!.value] as [luau.Expression, luau.Expression];
		});
		return luau.map(elements);
	} else {
		const id = state.pushToVar(luau.map(), "map");
		const valueId = luau.tempId("v");
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make<luau.AnyIdentifier>(luau.tempId(), valueId),
				expression: transformed,
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
