import { MacroManager } from "TSTransformer";
import { TransformServices } from "TSTransformer/types";
import ts from "typescript";

export function createTransformServices(typeChecker: ts.TypeChecker): TransformServices {
	const macroManager = new MacroManager(typeChecker);

	return { macroManager };
}
