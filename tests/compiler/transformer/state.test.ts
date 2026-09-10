import { assert } from "Shared/util/assert";
import { hasMultipleDefinitions } from "TSTransformer/util/hasMultipleDefinitions";
import ts from "typescript";

import { createTransformState } from "./createTransformState";

it("tracks only the active try statement and clears it after popping", () => {
	const state = createTransformState();
	state.markTryUses("usesReturn");
	expect(state.tryUsesStack).toEqual([]);

	const outer = state.pushTryUsesStack();
	state.markTryUses("usesReturn");
	const inner = state.pushTryUsesStack();
	state.markTryUses("usesBreak");
	expect(outer).toEqual({ usesReturn: true, usesBreak: false, usesContinue: false });
	expect(inner).toEqual({ usesReturn: false, usesBreak: true, usesContinue: false });

	state.popTryUsesStack();
	state.markTryUses("usesContinue");
	expect(outer.usesContinue).toBe(true);
	state.popTryUsesStack();
	state.markTryUses("usesBreak");
	expect(state.tryUsesStack).toEqual([]);
});

it("handles inferred tuple properties without source declarations", () => {
	const state = createTransformState("export type Tuple = [number];");
	const source = state.program.getSourceFile("/src/playground.tsx");
	assert(source);
	const symbol = state.typeChecker.getTypeAtLocation(source.statements[0]).getProperty("0");
	assert(symbol);
	expect(symbol.getDeclarations()).toBeUndefined();
	expect(hasMultipleDefinitions(symbol, ts.isFunctionDeclaration)).toBe(false);
	expect(state.getModuleIdPropertyAccess(symbol)).toBeUndefined();
});
