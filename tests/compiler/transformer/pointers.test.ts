import luau, { renderAST } from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { createArrayPointer, disableArrayInline } from "TSTransformer/util/pointer";

it("materializes an array pointer once when multiple operations disable inlining", () => {
	const prereqs = new Prereqs();
	const pointer = createArrayPointer("values");
	assert(luau.isArray(pointer.value));
	luau.list.push(pointer.value.members, luau.number(42));
	disableArrayInline(prereqs, pointer);
	const identifier = pointer.value;
	disableArrayInline(prereqs, pointer);

	expect(pointer.value).toBe(identifier);
	expect(renderAST(prereqs.statements)).toBe("local _values = { 42 }\n");
});
