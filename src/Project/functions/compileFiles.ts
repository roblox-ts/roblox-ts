import ts from "byots";
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
import { benchmarkIfVerbose } from "Shared/util/benchmark";
import { createTextDiagnostic } from "Shared/util/createTextDiagnostic";
import { MultiTransformState, transformSourceFile, TransformState } from "TSTransformer";

function inferProjectType(data: ProjectData, rojoResolver: RojoResolver): ProjectType {
	if (data.isPackage) {
		return ProjectType.Package;
	} else if (rojoResolver.isGame) {
		return ProjectType.Game;
	} else {
		return ProjectType.Model;
	}
}

function emitResultFailure(messageText: string): ts.EmitResult {
	return {
		emitSkipped: false,
		diagnostics: [createTextDiagnostic(messageText)],
	};
}

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
): ts.EmitResult {
	const compilerOptions = program.getCompilerOptions();
	const typeChecker = program.getProgram().getDiagnosticsProducingTypeChecker();

	const multiTransformState = new MultiTransformState();

	const rojoResolver = data.rojoConfigPath
		? RojoResolver.fromPath(data.rojoConfigPath)
		: RojoResolver.synthetic(data.projectPath);

	const projectType = data.projectOptions.type ?? inferProjectType(data, rojoResolver);

	let runtimeLibRbxPath: RbxPath | undefined;
	if (projectType !== ProjectType.Package) {
		runtimeLibRbxPath = rojoResolver.getRbxPathFromFilePath(path.join(data.includePath, "RuntimeLib.lua"));
		if (!runtimeLibRbxPath) {
			return emitResultFailure("Rojo config contained no data for include folder!");
		} else if (rojoResolver.getNetworkType(runtimeLibRbxPath) !== NetworkType.Unknown) {
			return emitResultFailure("Runtime library cannot be in a server-only or client-only container!");
		} else if (rojoResolver.isIsolated(runtimeLibRbxPath)) {
			return emitResultFailure("Runtime library cannot be in an isolated container!");
		}
	}

	const nodeModulesRbxPath = fs.pathExistsSync(data.nodeModulesPath)
		? rojoResolver.getRbxPathFromFilePath(data.nodeModulesPath)
		: undefined;

	LogService.writeLineIfVerbose(`Compiling as ${projectType}..`);

	const diagnostics = new Array<ts.Diagnostic>();
	const fileWriteQueue = new Array<{ sourceFile: ts.SourceFile; source: string }>();
	const progressMaxLength = `${sourceFiles.length}/${sourceFiles.length}`.length;
	for (let i = 0; i < sourceFiles.length; i++) {
		const sourceFile = sourceFiles[i];
		const progress = `${i + 1}/${sourceFiles.length}`.padStart(progressMaxLength);
		benchmarkIfVerbose(`${progress} compile ${path.relative(process.cwd(), sourceFile.fileName)}`, () => {
			if (diagnostics.push(...getCustomPreEmitDiagnostics(sourceFile)) > 0) return;
			if (diagnostics.push(...ts.getPreEmitDiagnostics(program.getProgram(), sourceFile)) > 0) return;

			const transformState = new TransformState(
				data,
				services,
				multiTransformState,
				compilerOptions,
				rojoResolver,
				runtimeLibRbxPath,
				nodeModulesRbxPath,
				typeChecker,
				projectType,
				sourceFile,
			);

			const luauAST = transformSourceFile(transformState, sourceFile);
			if (diagnostics.push(...transformState.diagnostics) > 0) return;

			const source = renderAST(luauAST);

			fileWriteQueue.push({ sourceFile, source });
		});
	}

	if (diagnostics.length > 0) return { emitSkipped: false, diagnostics };

	if (fileWriteQueue.length > 0) {
		benchmarkIfVerbose("writing compiled files", () => {
			for (const { sourceFile, source } of fileWriteQueue) {
				const outPath = services.pathTranslator.getOutputPath(sourceFile.fileName);
				fs.outputFileSync(outPath, source);
				if (compilerOptions.declaration) {
					program.emit(sourceFile, ts.sys.writeFile, undefined, true, {
						afterDeclarations: [transformTypeReferenceDirectives, transformPaths],
					});
				}
			}
		});
	}

	if (diagnostics.length === 0) {
		program.getProgram().emitBuildInfo();
	}

	return { emitSkipped: false, diagnostics };
}
