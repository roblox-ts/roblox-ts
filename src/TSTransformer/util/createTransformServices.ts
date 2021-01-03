import ts from "byots";
import fs from "fs-extra";
import path from "path";
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

	let roactIndexSourceFilePath = path.join(data.nodeModulesPath, "roact", "index.d.ts");
	if (fs.pathExistsSync(roactIndexSourceFilePath)) {
		roactIndexSourceFilePath = fs.realpathSync(roactIndexSourceFilePath);
	}
	const roactIndexSourceFile = program.getSourceFile(roactIndexSourceFilePath);
	const roactSymbolManager = roactIndexSourceFile
		? new RoactSymbolManager(typeChecker, roactIndexSourceFile)
		: undefined;

	return { globalSymbols, macroManager, roactSymbolManager };
}
