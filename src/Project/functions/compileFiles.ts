import { renderAST } from "@roblox-ts/luau-ast";
import { PathTranslator } from "@roblox-ts/path-translator";
import { NetworkType, RbxPath, RojoResolver } from "@roblox-ts/rojo-resolver";
import fs from "fs-extra";
import path from "path";
import { checkFileName } from "Project/functions/checkFileName";
import { checkRojoConfig } from "Project/functions/checkRojoConfig";
import { createNodeModulesPathMapping } from "Project/functions/createNodeModulesPathMapping";
import transformPathsTransformer from "Project/transformers/builtin/transformPaths";
import { transformTypeReferenceDirectives } from "Project/transformers/builtin/transformTypeReferenceDirectives";
import { createTransformerList, flattenIntoTransformers } from "Project/transformers/createTransformerList";
import { createTransformerWatcher } from "Project/transformers/createTransformerWatcher";
import { getPluginConfigs } from "Project/transformers/getPluginConfigs";
import { getCustomPreEmitDiagnostics } from "Project/util/getCustomPreEmitDiagnostics";
import { LogService } from "Shared/classes/LogService";
import { ProjectType } from "Shared/constants";
import { ProjectData } from "Shared/types";
import { assert } from "Shared/util/assert";
import { benchmarkIfVerbose } from "Shared/util/benchmark";
import { createTextDiagnostic } from "Shared/util/createTextDiagnostic";
import { getRootDirs } from "Shared/util/getRootDirs";
import { hasErrors } from "Shared/util/hasErrors";
import { MultiTransformState, transformSourceFile, TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { createTransformServices } from "TSTransformer/util/createTransformServices";
import ts from "typescript";

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
		emitSkipped: true,
		diagnostics: [createTextDiagnostic(messageText)],
	};
}

/**
 * 'transpiles' TypeScript project into a logically identical Luau project.
 *
 * writes rendered Luau source to the out directory.
 */
export function compileFiles(
	program: ts.Program,
	data: ProjectData,
	pathTranslator: PathTranslator,
	sourceFiles: Array<ts.SourceFile>,
): ts.EmitResult {
	const compilerOptions = program.getCompilerOptions();

	const multiTransformState = new MultiTransformState();

	const outDir = compilerOptions.outDir!;

	const rojoResolver = data.rojoConfigPath
		? RojoResolver.fromPath(data.rojoConfigPath)
		: RojoResolver.synthetic(outDir);

	for (const warning of rojoResolver.getWarnings()) {
		LogService.warn(warning);
	}

	checkRojoConfig(data, rojoResolver, getRootDirs(compilerOptions), pathTranslator);

	for (const sourceFile of program.getSourceFiles()) {
		if (!path.normalize(sourceFile.fileName).startsWith(data.nodeModulesPath)) {
			checkFileName(sourceFile.fileName);
		}
	}

	const pkgRojoResolvers = compilerOptions.typeRoots!.map(RojoResolver.synthetic);
	const nodeModulesPathMapping = createNodeModulesPathMapping(compilerOptions.typeRoots!);

	const projectType = data.projectOptions.type ?? inferProjectType(data, rojoResolver);

	if (projectType !== ProjectType.Package && data.rojoConfigPath === undefined) {
		return emitResultFailure("Non-package projects must have a Rojo project file!");
	}

	let runtimeLibRbxPath: RbxPath | undefined;
	if (projectType !== ProjectType.Package) {
		runtimeLibRbxPath = rojoResolver.getRbxPathFromFilePath(
			path.join(data.projectOptions.includePath, "RuntimeLib.lua"),
		);
		if (!runtimeLibRbxPath) {
			return emitResultFailure("Rojo project contained no data for include folder!");
		} else if (rojoResolver.getNetworkType(runtimeLibRbxPath) !== NetworkType.Unknown) {
			return emitResultFailure("Runtime library cannot be in a server-only or client-only container!");
		} else if (rojoResolver.isIsolated(runtimeLibRbxPath)) {
			return emitResultFailure("Runtime library cannot be in an isolated container!");
		}
	}

	if (DiagnosticService.hasErrors()) return { emitSkipped: true, diagnostics: DiagnosticService.flush() };

	LogService.writeLineIfVerbose(`compiling as ${projectType}..`);

	const fileWriteQueue = new Array<{ sourceFile: ts.SourceFile; source: string }>();
	const progressMaxLength = `${sourceFiles.length}/${sourceFiles.length}`.length;

	let proxyProgram = program;

	if (compilerOptions.plugins && compilerOptions.plugins.length > 0) {
		benchmarkIfVerbose(`running transformers..`, () => {
			const pluginConfigs = getPluginConfigs(data.tsConfigPath);
			const transformerList = createTransformerList(program, pluginConfigs, data.projectPath);
			const transformers = flattenIntoTransformers(transformerList);
			if (transformers.length > 0) {
				const { service, updateFile } = (data.transformerWatcher ??= createTransformerWatcher(program));
				const transformResult = ts.transformNodes(
					undefined,
					undefined,
					ts.factory,
					compilerOptions,
					sourceFiles,
					transformers,
					false,
				);

				if (transformResult.diagnostics) DiagnosticService.addDiagnostics(transformResult.diagnostics);

				for (const sourceFile of transformResult.transformed) {
					if (ts.isSourceFile(sourceFile)) {
						// transformed nodes don't have symbol or type information (or they have out of date information)
						// there's no way to "rebind" an existing file, so we have to reprint it
						const source = ts.createPrinter().printFile(sourceFile);
						updateFile(sourceFile.fileName, source);
						if (data.projectOptions.writeTransformedFiles) {
							const outPath = pathTranslator.getOutputTransformedPath(sourceFile.fileName);
							fs.outputFileSync(outPath, source);
						}
					}
				}

				proxyProgram = service.getProgram()!;
			}
		});
	}

	if (DiagnosticService.hasErrors()) return { emitSkipped: true, diagnostics: DiagnosticService.flush() };

	const typeChecker = proxyProgram.getTypeChecker();
	const services = createTransformServices(typeChecker);

	for (let i = 0; i < sourceFiles.length; i++) {
		const originalSourceFile = sourceFiles[i];
		const sourceFile = proxyProgram.getSourceFile(sourceFiles[i].fileName);
		assert(sourceFile);
		const progress = `${i + 1}/${sourceFiles.length}`.padStart(progressMaxLength);
		benchmarkIfVerbose(`${progress} compile ${path.relative(process.cwd(), sourceFile.fileName)}`, () => {
			const proxyDiagnostics = ts.getPreEmitDiagnostics(proxyProgram, sourceFile);
			if (sourceFile !== originalSourceFile && hasErrors(proxyDiagnostics)) {
				// The transformed source file has diagnostics, but we want to present the original diagnostic spans.
				// If the original file doesn't have diagnostics, the diagnostics are caused by a transformer and we display them instead.
				const sourceDiagnostics = ts.getPreEmitDiagnostics(program, originalSourceFile);
				DiagnosticService.addDiagnostics(hasErrors(sourceDiagnostics) ? sourceDiagnostics : proxyDiagnostics);
			} else {
				DiagnosticService.addDiagnostics(proxyDiagnostics);
			}

			DiagnosticService.addDiagnostics(getCustomPreEmitDiagnostics(data, sourceFile));
			if (DiagnosticService.hasErrors()) return;

			const transformState = new TransformState(
				proxyProgram,
				data,
				services,
				pathTranslator,
				multiTransformState,
				compilerOptions,
				rojoResolver,
				pkgRojoResolvers,
				nodeModulesPathMapping,
				runtimeLibRbxPath,
				typeChecker,
				projectType,
				sourceFile,
			);

			const luauAST = transformSourceFile(transformState, sourceFile);
			if (DiagnosticService.hasErrors()) return;

			const source = renderAST(luauAST);

			fileWriteQueue.push({ sourceFile, source });
		});
	}

	if (DiagnosticService.hasErrors()) return { emitSkipped: true, diagnostics: DiagnosticService.flush() };

	const emittedFiles = new Array<string>();
	if (fileWriteQueue.length > 0) {
		benchmarkIfVerbose("writing compiled files", () => {
			const afterDeclarations = compilerOptions.declaration
				? [transformTypeReferenceDirectives, transformPathsTransformer(program, {})]
				: undefined;
			for (const { sourceFile, source } of fileWriteQueue) {
				const outPath = pathTranslator.getOutputPath(sourceFile.fileName);
				if (
					!data.projectOptions.writeOnlyChanged ||
					!fs.pathExistsSync(outPath) ||
					fs.readFileSync(outPath).toString() !== source
				) {
					fs.outputFileSync(outPath, source);
					emittedFiles.push(outPath);
				}
				if (compilerOptions.declaration) {
					proxyProgram.emit(sourceFile, ts.sys.writeFile, undefined, true, { afterDeclarations });
				}
			}
		});
	}

	program.emitBuildInfo();

	return { emittedFiles, emitSkipped: false, diagnostics: DiagnosticService.flush() };
}
