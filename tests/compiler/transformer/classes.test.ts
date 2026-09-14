import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformPropertyDeclaration } from "TSTransformer/nodes/class/transformPropertyDeclaration";
import ts from "typescript";

import { createTransformState } from "./createTransformState";

it("leaves instance field initializers to the constructor transform", () => {
	const state = createTransformState(`
		declare function initialize(): number;
		class Example { value = initialize(); }
	`);
	const source = state.program.getSourceFile("/src/playground.tsx");
	assert(source);
	const declaration = source.statements[1];
	assert(ts.isClassDeclaration(declaration));
	const property = declaration.members[0];
	assert(ts.isPropertyDeclaration(property));
	const prereqs = new Prereqs();

	const statements = transformPropertyDeclaration(state, prereqs, property, luau.id("Example"));

	expect(luau.list.isEmpty(statements)).toBe(true);
	expect(luau.list.isEmpty(prereqs.statements)).toBe(true);
});
