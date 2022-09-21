import { ProjectData } from "Shared/types";
import { MacroManager, RoactSymbolManager } from "TSTransformer";
import { TransformServices } from "TSTransformer/types";
import ts from "typescript";

export function createTransformServices(
	program: ts.Program,
	typeChecker: ts.TypeChecker,
	data: ProjectData,
): TransformServices {
	const macroManager = new MacroManager(typeChecker);

	const roactSymbolManager = RoactSymbolManager.create(data, program, typeChecker);

	return { macroManager, roactSymbolManager };
}
