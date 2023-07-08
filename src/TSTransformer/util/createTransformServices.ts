import { MacroManager } from "TSTransformer";
import { JSXSymbolManager } from "TSTransformer/classes/JSXSymbolManager";
import { TransformServices } from "TSTransformer/types";
import ts from "typescript";

export function createTransformServices(typeChecker: ts.TypeChecker): TransformServices {
	const macroManager = new MacroManager(typeChecker);
	const jsxSymbolManager = new JSXSymbolManager(typeChecker);

	return { macroManager, jsxSymbolManager };
}
