import luau from "@roblox-ts/luau-ast";
import { Prereqs } from "TSTransformer/classes/Prereqs";

export interface Pointer<T> {
	name: string;
	value: T;
}

export type MapPointer = Pointer<luau.Map | luau.TemporaryIdentifier>;
export type ArrayPointer = Pointer<luau.Array | luau.TemporaryIdentifier>;

export function createMapPointer(name: string): MapPointer {
	return { name, value: luau.map() };
}

export function createArrayPointer(name: string): ArrayPointer {
	return { name, value: luau.array() };
}

export function assignToMapPointer(
	prereqs: Prereqs,
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
		prereqs.prereq(
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

export function disableMapInline(prereqs: Prereqs, ptr: MapPointer): asserts ptr is Pointer<luau.TemporaryIdentifier> {
	if (luau.isMap(ptr.value)) {
		ptr.value = prereqs.pushToVar(ptr.value, ptr.name);
	}
}

export function disableArrayInline(
	prereqs: Prereqs,
	ptr: ArrayPointer,
): asserts ptr is Pointer<luau.TemporaryIdentifier> {
	if (luau.isArray(ptr.value)) {
		ptr.value = prereqs.pushToVar(ptr.value, ptr.name);
	}
}
