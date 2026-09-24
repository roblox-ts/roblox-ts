import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import * as sourceTransform from "TSTransformer/nodes/transformSourceFile";

import { createTestProject } from "../createTestProject";

// retain a real compilation's state for helpers whose inputs are Luau nodes or checker types
export function createTransformState(source = "export const value = 1;") {
	let state: TransformState | undefined;
	const transformSourceFile = sourceTransform.transformSourceFile;
	const spy = jest.spyOn(sourceTransform, "transformSourceFile").mockImplementation((currentState, node) => {
		state = currentState;
		return transformSourceFile(currentState, node);
	});
	try {
		createTestProject().compileSource(source);
	} finally {
		spy.mockRestore();
	}
	assert(state);
	return state;
}
