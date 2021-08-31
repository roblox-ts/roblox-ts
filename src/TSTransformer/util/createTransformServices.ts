import ts from "typescript";
import { ProjectData } from "Shared/types";
import { GlobalSymbols, MacroManager, RoactSymbolManager } from "TSTransformer";
import { TransformServices } from "TSTransformer/types";

export function createTransformServices(
	program: ts.Program,
	typeChecker: ts.TypeChecker,
	data: ProjectData,
): TransformServices {
	const globalSymbols = new GlobalSymbols(typeChecker);

	const macroManager = new MacroManager(typeChecker);

	const roactSymbolManager = RoactSymbolManager.create(data, program, typeChecker);

	return { globalSymbols, macroManager, roactSymbolManager };
}
