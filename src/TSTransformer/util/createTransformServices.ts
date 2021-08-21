import ts from "byots";
import { ProjectData } from "Shared/types";
import { GlobalSymbols, JsxSymbolManager, MacroManager } from "TSTransformer";
import { TransformServices } from "TSTransformer/types";

export function createTransformServices(
	program: ts.Program,
	typeChecker: ts.TypeChecker,
	data: ProjectData,
	compilerOptions: ts.CompilerOptions,
): TransformServices {
	const globalSymbols = new GlobalSymbols(typeChecker);

	const macroManager = new MacroManager(typeChecker);

	const roactSymbolManager = JsxSymbolManager.create(data, program, typeChecker, compilerOptions);

	return { globalSymbols, macroManager, roactSymbolManager };
}
