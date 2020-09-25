import ts from "byots";
import path from "path";
import { ProjectData, ProjectServices } from "Project/types";
import { findAncestorDir } from "Project/util/findAncestorDir";
import { getRootDirs } from "Project/util/getRootDirs";
import { PathTranslator } from "Shared/classes/PathTranslator";
import { GlobalSymbols, MacroManager, RoactSymbolManager } from "TSTransformer";

export function createProjectServices(program: ts.BuilderProgram, data: ProjectData): ProjectServices {
	const compilerOptions = program.getCompilerOptions();
	const typeChecker = program.getProgram().getDiagnosticsProducingTypeChecker();

	const globalSymbols = new GlobalSymbols(typeChecker);

	const macroManager = new MacroManager(program.getProgram(), typeChecker, data.nodeModulesPath);

	const rootDir = findAncestorDir([program.getProgram().getCommonSourceDirectory(), ...getRootDirs(compilerOptions)]);
	const outDir = compilerOptions.outDir!;
	let buildInfoPath = ts.getTsBuildInfoEmitOutputFilePath(compilerOptions);
	if (buildInfoPath !== undefined) {
		buildInfoPath = path.normalize(buildInfoPath);
	}
	const declaration = compilerOptions.declaration === true;
	const pathTranslator = new PathTranslator(rootDir, outDir, buildInfoPath, declaration);

	const roactIndexSourceFile = program.getSourceFile(path.join(data.nodeModulesPath, "roact", "index.d.ts"));
	let roactSymbolManager: RoactSymbolManager | undefined;
	if (roactIndexSourceFile) {
		roactSymbolManager = new RoactSymbolManager(typeChecker, roactIndexSourceFile);
	}

	return { globalSymbols, macroManager, pathTranslator, roactSymbolManager };
}
