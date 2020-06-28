import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";

export interface Pointer<T> {
	value: T;
}

export type MapPointer = Pointer<lua.Map | lua.TemporaryIdentifier>;
export type ArrayPointer = Pointer<lua.Array | lua.TemporaryIdentifier>;
export type MixedTablePointer = Pointer<lua.MixedTable | lua.TemporaryIdentifier>;

export function createMapPointer(): MapPointer {
	return { value: lua.map() };
}

export function createArrayPointer(): ArrayPointer {
	return { value: lua.array() };
}

export function createMixedTablePointer(): MixedTablePointer {
	return { value: lua.mixedTable() };
}

export function assignToMapPointer(
	state: TransformState,
	ptr: Pointer<lua.Map | lua.AnyIdentifier>,
	left: lua.Expression,
	right: lua.Expression,
) {
	if (lua.isMap(ptr.value)) {
		lua.list.push(
			ptr.value.fields,
			lua.create(lua.SyntaxKind.MapField, {
				index: left,
				value: right,
			}),
		);
	} else {
		state.prereq(
			lua.create(lua.SyntaxKind.Assignment, {
				left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
					expression: ptr.value,
					index: left,
				}),
				operator: "=",
				right,
			}),
		);
	}
}

export function assignToMixedTablePointer(
	state: TransformState,
	ptr: MixedTablePointer,
	left: lua.Expression,
	right: lua.Expression,
) {
	if (lua.isMixedTable(ptr.value)) {
		lua.list.push(
			ptr.value.fields,
			lua.create(lua.SyntaxKind.MapField, {
				index: left,
				value: right,
			}),
		);
	} else {
		state.prereq(
			lua.create(lua.SyntaxKind.Assignment, {
				left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
					expression: ptr.value,
					index: left,
				}),
				operator: "=",
				right,
			}),
		);
	}
}

export function disableMapInline(
	state: TransformState,
	ptr: MapPointer,
): asserts ptr is Pointer<lua.TemporaryIdentifier> {
	if (lua.isMap(ptr.value)) {
		ptr.value = state.pushToVar(ptr.value);
	}
}

export function disableArrayInline(
	state: TransformState,
	ptr: ArrayPointer,
): asserts ptr is Pointer<lua.TemporaryIdentifier> {
	if (lua.isArray(ptr.value)) {
		ptr.value = state.pushToVar(ptr.value);
	}
}

export function disableMixedTableInline(
	state: TransformState,
	ptr: MixedTablePointer,
): asserts ptr is Pointer<lua.TemporaryIdentifier> {
	if (lua.isMixedTable(ptr.value)) {
		ptr.value = state.pushToVar(ptr.value);
	}
}
