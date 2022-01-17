import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";

export interface Pointer<T> {
	name: string;
	value: T;
}

export type MapPointer = Pointer<luau.Map | luau.TemporaryIdentifier>;
export type ArrayPointer = Pointer<luau.Array | luau.TemporaryIdentifier>;
export type MixedTablePointer = Pointer<luau.MixedTable | luau.TemporaryIdentifier>;

export function createMapPointer(name: string): MapPointer {
	return { name, value: luau.map() };
}

export function createArrayPointer(name: string): ArrayPointer {
	return { name, value: luau.array() };
}

export function createMixedTablePointer(name: string): MixedTablePointer {
	return { name, value: luau.mixedTable() };
}

export function assignToMapPointer(
	state: TransformState,
	ptr: Pointer<luau.Map | luau.AnyIdentifier>,
	left: luau.Expression,
	right: luau.Expression,
) {
	if (luau.isMap(ptr.value)) {
		luau.list.push(
			ptr.value.fields,
			luau.create(luau.SyntaxKind.MapField, {
				index: left,
				value: right,
			}),
		);
	} else {
		state.prereq(
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
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
	left: luau.Expression,
	right: luau.Expression,
) {
	if (luau.isMixedTable(ptr.value)) {
		luau.list.push(
			ptr.value.fields,
			luau.create(luau.SyntaxKind.MapField, {
				index: left,
				value: right,
			}),
		);
	} else {
		state.prereq(
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
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
): asserts ptr is Pointer<luau.TemporaryIdentifier> {
	if (luau.isMap(ptr.value)) {
		ptr.value = state.pushToVar(ptr.value, ptr.name);
	}
}

export function disableArrayInline(
	state: TransformState,
	ptr: ArrayPointer,
): asserts ptr is Pointer<luau.TemporaryIdentifier> {
	if (luau.isArray(ptr.value)) {
		ptr.value = state.pushToVar(ptr.value, ptr.name);
	}
}

export function disableMixedTableInline(
	state: TransformState,
	ptr: MixedTablePointer,
): asserts ptr is Pointer<luau.TemporaryIdentifier> {
	if (luau.isMixedTable(ptr.value)) {
		ptr.value = state.pushToVar(ptr.value, ptr.name);
	}
}
