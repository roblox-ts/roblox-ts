import ts from "byots";
import fs from "fs-extra";
import { renderAST } from "LuauRenderer";
import path from "path";
import { createProjectProgram } from "Project/functions/createProjectProgram";
import { transformPaths } from "Project/transformers/builtin/transformPaths";
import { transformTypeReferenceDirectives } from "Project/transformers/builtin/transformTypeReferenceDirectives";
import { createTransformedCompilerHost } from "Project/transformers/createTransformedCompilerHost";
import { createTransformerList, flattenIntoTransformers } from "Project/transformers/createTransformerList";
import { getPluginConfigs } from "Project/transformers/getPluginConfigs";
import { ProjectData, ProjectServices } from "Project/types";
import { getCustomPreEmitDiagnostics } from "Project/util/getCustomPreEmitDiagnostics";
import { hasErrors } from "Project/util/hasErrors";
import { LogService } from "Shared/classes/LogService";
import { NetworkType, RbxPath, RojoResolver } from "Shared/classes/RojoResolver";
import { ProjectType } from "Shared/constants";
import { assert } from "Shared/util/assert";
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

const getCanonicalFileName: ts.GetCanonicalFileName = v => v;
function getReverseSymlinkMap(program: ts.Program) {
	const symlinkCache = ts.discoverProbableSymlinks(
		program.getSourceFiles(),
		getCanonicalFileName,
		ts.sys.getCurrentDirectory(),
	);
	const directoriesMap = symlinkCache.getSymlinkedDirectories();
	const result = new Map<string, string>();
	if (directoriesMap) {
		directoriesMap.forEach((dir, fsPath) => {
			if (typeof dir !== "boolean") {
				result.set(dir.real, fsPath);
			}
		});
	}
	return result;
}

/**
 * 'transpiles' TypeScript project into a logically identical Luau project.
 *
 * writes rendered Luau source to the out directory.
 */
export function compileFiles(
	program: ts.Program,
	data: ProjectData,
	services: ProjectServices,
	sourceFiles: Array<ts.SourceFile>,
): ts.EmitResult {
	const compilerOptions = program.getCompilerOptions();
	const typeChecker = program.getDiagnosticsProducingTypeChecker();

	const multiTransformState = new MultiTransformState();

	const rojoResolver = data.rojoConfigPath
		? RojoResolver.fromPath(data.rojoConfigPath)
		: RojoResolver.synthetic(data.projectPath);

	const pkgRojoResolver = RojoResolver.synthetic(data.nodeModulesPath);

	const reverseSymlinkMap = getReverseSymlinkMap(program);

	const projectType = data.projectOptions.type ?? inferProjectType(data, rojoResolver);

	if (projectType !== ProjectType.Package && data.rojoConfigPath === undefined) {
		return emitResultFailure("Non-package projects must have a Rojo project file!");
	}

	let runtimeLibRbxPath: RbxPath | undefined;
	if (projectType !== ProjectType.Package) {
		runtimeLibRbxPath = rojoResolver.getRbxPathFromFilePath(path.join(data.includePath, "RuntimeLib.lua"));
		if (!runtimeLibRbxPath) {
			return emitResultFailure("Rojo project contained no data for include folder!");
		} else if (rojoResolver.getNetworkType(runtimeLibRbxPath) !== NetworkType.Unknown) {
			return emitResultFailure("Runtime library cannot be in a server-only or client-only container!");
		} else if (rojoResolver.isIsolated(runtimeLibRbxPath)) {
			return emitResultFailure("Runtime library cannot be in an isolated container!");
		}
	}

	if (!rojoResolver.getRbxPathFromFilePath(data.nodeModulesPath)) {
		return emitResultFailure("Rojo project contained no data for node_modules folder!");
	}

	LogService.writeLineIfVerbose(`compiling as ${projectType}..`);

	const diagnostics = new Array<ts.Diagnostic>();
	const fileWriteQueue = new Array<{ sourceFile: ts.SourceFile; source: string }>();
	const progressMaxLength = `${sourceFiles.length}/${sourceFiles.length}`.length;

	let proxyProgram = program;

	if (compilerOptions.plugins && compilerOptions.plugins.length > 0) {
		benchmarkIfVerbose(`running transformers..`, () => {
			const pluginConfigs = getPluginConfigs(data.tsConfigPath);
			const transformerList = createTransformerList(program, pluginConfigs, data.projectPath);
			const transformers = flattenIntoTransformers(transformerList);
			if (transformers.length > 0) {
				const transformResult = ts.transformNodes(
					undefined,
					undefined,
					ts.factory,
					compilerOptions,
					sourceFiles,
					transformers,
					false,
				);

				const host = createTransformedCompilerHost(program.getCompilerOptions(), sourceFiles, transformResult);
				proxyProgram = createProjectProgram(data, host).getProgram();
			}
		});
	}

	for (let i = 0; i < sourceFiles.length; i++) {
		const sourceFile = proxyProgram.getSourceFile(sourceFiles[i].fileName);
		assert(sourceFile);
		const progress = `${i + 1}/${sourceFiles.length}`.padStart(progressMaxLength);
		benchmarkIfVerbose(`${progress} compile ${path.relative(process.cwd(), sourceFile.fileName)}`, () => {
			diagnostics.push(...getCustomPreEmitDiagnostics(sourceFile));
			if (hasErrors(diagnostics)) return;
			diagnostics.push(...ts.getPreEmitDiagnostics(proxyProgram, sourceFile));
			if (hasErrors(diagnostics)) return;

			const transformState = new TransformState(
				data,
				services,
				multiTransformState,
				compilerOptions,
				rojoResolver,
				pkgRojoResolver,
				reverseSymlinkMap,
				runtimeLibRbxPath,
				typeChecker,
				projectType,
				sourceFile,
			);

			const luauAST = transformSourceFile(transformState, sourceFile);
			diagnostics.push(...transformState.diagnostics);
			if (hasErrors(diagnostics)) return;

			const source = renderAST(luauAST);

			fileWriteQueue.push({ sourceFile, source });
		});
	}

	if (hasErrors(diagnostics)) return { emitSkipped: false, diagnostics };

	if (fileWriteQueue.length > 0) {
		benchmarkIfVerbose("writing compiled files", () => {
			for (const { sourceFile, source } of fileWriteQueue) {
				const outPath = services.pathTranslator.getOutputPath(sourceFile.fileName);
				if (
					!data.writeOnlyChanged ||
					!fs.pathExistsSync(outPath) ||
					fs.readFileSync(outPath).toString() !== source
				) {
					fs.outputFileSync(outPath, source);
				}
				if (compilerOptions.declaration) {
					program.emit(sourceFile, ts.sys.writeFile, undefined, true, {
						afterDeclarations: [transformTypeReferenceDirectives, transformPaths],
					});
				}
			}
		});
	}

	program.emitBuildInfo();

	return { emitSkipped: false, diagnostics };
}
