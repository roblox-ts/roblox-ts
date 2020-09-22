import ts, { EmitResolver } from "byots";
import fs from "fs-extra";
import { renderAST } from "LuauRenderer";
import path from "path";
import { transformPaths } from "Project/transformers/transformPaths";
import { transformTypeReferenceDirectives } from "Project/transformers/transformTypeReferenceDirectives";
import { ProjectData, ProjectServices } from "Project/types";
import { getCustomPreEmitDiagnostics } from "Project/util/getCustomPreEmitDiagnostics";
import { LogService } from "Shared/classes/LogService";
import { NetworkType, RbxPath, RojoResolver } from "Shared/classes/RojoResolver";
import { ProjectType } from "Shared/constants";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { ProjectError } from "Shared/errors/ProjectError";
import { benchmarkIfVerbose } from "Shared/util/benchmark";
import { MultiTransformState, transformSourceFile, TransformState } from "TSTransformer";

/**
 * 'transpiles' TypeScript project into a logically identical Luau project.
 *
 * writes rendered Luau source to the out directory.
 */
export function compileFiles(
	program: ts.BuilderProgram,
	data: ProjectData,
	services: ProjectServices,
	sourceFiles: Array<ts.SourceFile>,
) {
	const compilerOptions = program.getCompilerOptions();
	const typeChecker = program.getProgram().getDiagnosticsProducingTypeChecker();

	const rojoResolver = data.rojoConfigPath
		? RojoResolver.fromPath(data.rojoConfigPath)
		: RojoResolver.synthetic(data.projectPath);

	let projectType = data.projectOptions.type;
	if (!projectType) {
		if (data.isPackage) {
			projectType = ProjectType.Package;
		} else if (rojoResolver.isGame) {
			projectType = ProjectType.Game;
		} else {
			projectType = ProjectType.Model;
		}
	}

	LogService.writeLineIfVerbose(`Compiling as ${projectType}..`);

	// validates and establishes runtime library
	let runtimeLibRbxPath: RbxPath | undefined;
	if (projectType !== ProjectType.Package) {
		const runtimeFsPath = path.join(data.includePath, "RuntimeLib.lua");
		runtimeLibRbxPath = rojoResolver.getRbxPathFromFilePath(runtimeFsPath);
		if (!runtimeLibRbxPath) {
			throw new ProjectError(`Rojo config contained no data for include folder!`);
		} else if (rojoResolver.getNetworkType(runtimeLibRbxPath) !== NetworkType.Unknown) {
			throw new ProjectError(`Runtime library cannot be in a server-only or client-only container!`);
		} else if (rojoResolver.isIsolated(runtimeLibRbxPath)) {
			throw new ProjectError(`Runtime library cannot be in an isolated container!`);
		}
	}

	let nodeModulesRbxPath: RbxPath | undefined;
	if (fs.pathExistsSync(data.nodeModulesPath)) {
		nodeModulesRbxPath = rojoResolver.getRbxPathFromFilePath(data.nodeModulesPath);
	}

	const multiTransformState = new MultiTransformState();
	const totalDiagnostics = new Array<ts.Diagnostic>();

	const fileWriteQueue = new Array<{ sourceFile: ts.SourceFile; source: string }>();

	const progressMaxLength = `${sourceFiles.length}/${sourceFiles.length}`.length;
	for (let i = 0; i < sourceFiles.length; i++) {
		const sourceFile = sourceFiles[i];
		const progress = `${i + 1}/${sourceFiles.length}`.padStart(progressMaxLength);

		benchmarkIfVerbose(`${progress} compile ${path.relative(process.cwd(), sourceFile.fileName)}`, () => {
			const customPreEmitDiagnostics = getCustomPreEmitDiagnostics(sourceFile);
			totalDiagnostics.push(...customPreEmitDiagnostics);
			if (totalDiagnostics.length > 0) return;

			const preEmitDiagnostics = ts.getPreEmitDiagnostics(program.getProgram(), sourceFile);
			totalDiagnostics.push(...preEmitDiagnostics);
			if (totalDiagnostics.length > 0) return;

			// create a new transform state for the file
			const transformState = new TransformState(
				compilerOptions,
				multiTransformState,
				rojoResolver,
				services.pathTranslator,
				runtimeLibRbxPath,
				data.nodeModulesPath,
				nodeModulesRbxPath,
				data.nodeModulesPathMapping,
				typeChecker,
				services.globalSymbols,
				services.macroManager,
				services.roactSymbolManager,
				projectType,
				data.pkgVersion,
				sourceFile,
			);

			// create a new Luau abstract syntax tree for the file
			const luauAST = transformSourceFile(transformState, sourceFile);
			totalDiagnostics.push(...transformState.diagnostics);
			if (totalDiagnostics.length > 0) return;

			// render Luau abstract syntax tree and output only if there were no diagnostics
			const source = renderAST(luauAST);

			fileWriteQueue.push({ sourceFile, source });
		});

		if (totalDiagnostics.length > 0) break;
	}

	if (totalDiagnostics.length > 0) {
		throw new DiagnosticError(totalDiagnostics);
	}

	if (fileWriteQueue.length > 0) {
		benchmarkIfVerbose("writing compiled files", () => {
			for (const { sourceFile, source } of fileWriteQueue) {
				fs.outputFileSync(services.pathTranslator.getOutputPath(sourceFile.fileName), source);
				if (compilerOptions.declaration) {
					program.emit(sourceFile, ts.sys.writeFile, undefined, true, {
						afterDeclarations: [transformTypeReferenceDirectives, transformPaths],
					});
				}
			}
		});
	}
}

const failResult = (diagnostics: ReadonlyArray<ts.Diagnostic>): ts.EmitResult => ({ emitSkipped: false, diagnostics });

export function compileFile(
	program: ts.BuilderProgram,
	data: ProjectData,
	services: ProjectServices,
	sourceFile: ts.SourceFile,
	multiTransformState: MultiTransformState,
	rojoResolver: RojoResolver,
	projectType?: ProjectType,
	runtimeLibRbxPath?: RbxPath,
	nodeModulesRbxPath?: RbxPath,
): ts.EmitResult {
	const compilerOptions = program.getCompilerOptions();
	const typeChecker = program.getProgram().getDiagnosticsProducingTypeChecker();

	const totalDiagnostics = new Array<ts.Diagnostic>();

	totalDiagnostics.push(...getCustomPreEmitDiagnostics(sourceFile));
	if (totalDiagnostics.length > 0) return failResult(totalDiagnostics);

	totalDiagnostics.push(...ts.getPreEmitDiagnostics(program.getProgram(), sourceFile));
	if (totalDiagnostics.length > 0) return failResult(totalDiagnostics);

	const transformState = new TransformState(
		compilerOptions,
		multiTransformState,
		rojoResolver,
		services.pathTranslator,
		runtimeLibRbxPath,
		data.nodeModulesPath,
		nodeModulesRbxPath,
		data.nodeModulesPathMapping,
		typeChecker,
		services.globalSymbols,
		services.macroManager,
		services.roactSymbolManager,
		projectType,
		data.pkgVersion,
		sourceFile,
	);

	const luauAST = transformSourceFile(transformState, sourceFile);
	totalDiagnostics.push(...transformState.diagnostics);
	if (totalDiagnostics.length > 0) return failResult(totalDiagnostics);

	const source = renderAST(luauAST);

	const outPath = services.pathTranslator.getOutputPath(sourceFile.fileName);
	fs.outputFileSync(outPath, source);
	if (compilerOptions.declaration) {
		program.emit(sourceFile, ts.sys.writeFile, undefined, true, {
			afterDeclarations: [transformTypeReferenceDirectives, transformPaths],
		});
	}

	return { emitSkipped: false, diagnostics: [] };
}
