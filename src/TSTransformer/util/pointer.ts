import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";

export interface Pointer<T> {
	value: T;
}

export function createMapPointer(): Pointer<lua.Map | lua.TemporaryIdentifier> {
	return { value: lua.map() };
}

export function assignToPointer(
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
				right: right,
			}),
		);
	}
}

export function disableInline(
	state: TransformState,
	ptr: Pointer<lua.Map | lua.TemporaryIdentifier>,
): asserts ptr is Pointer<lua.TemporaryIdentifier> {
	if (lua.isMap(ptr.value)) {
		ptr.value = state.pushToVar(ptr.value);
	}
}
