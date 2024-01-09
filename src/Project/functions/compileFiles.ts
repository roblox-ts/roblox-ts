import { renderAST } from "@roblox-ts/luau-ast";
import { NetworkType, RbxPath, RojoResolver } from "@roblox-ts/rojo-resolver";
import fs from "fs-extra";
import path from "path";
import { checkFileName } from "Project/functions/checkFileName";
import { checkRojoConfig } from "Project/functions/checkRojoConfig";
import { createNodeModulesPathMapping } from "Project/functions/createNodeModulesPathMapping";
import { transformPaths } from "Project/transformers/builtin/transformPaths";
import { transformTypeReferenceDirectives } from "Project/transformers/builtin/transformTypeReferenceDirectives";
import { createTransformerList, flattenIntoTransformers } from "Project/transformers/createTransformerList";
import { createTransformerWatcher } from "Project/transformers/createTransformerWatcher";
import { getPluginConfigs } from "Project/transformers/getPluginConfigs";
import { getCustomPreEmitDiagnostics } from "Project/util/getCustomPreEmitDiagnostics";
import { LogService } from "Shared/classes/LogService";
import { PathTranslator } from "Shared/classes/PathTranslator";
import { ProjectType } from "Shared/constants";
import { ProjectData } from "Shared/types";
import { assert } from "Shared/util/assert";
import { benchmarkIfVerbose } from "Shared/util/benchmark";
import { createTextDiagnostic } from "Shared/util/createTextDiagnostic";
import { getRootDirs } from "Shared/util/getRootDirs";
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
		emitSkipped: false,
		diagnostics: [createTextDiagnostic(messageText)],
	};
}

function getReverseSymlinkMap(program: ts.Program) {
	const result = new Map<string, string>();

	const directoriesMap = program.getSymlinkCache?.()?.getSymlinkedDirectories();
	if (directoriesMap) {
		directoriesMap.forEach((dir, fsPath) => {
			if (typeof dir !== "boolean") {
				result.set(dir.real, fsPath);
			}
		});
	}

	return result;
}

const EMIT_ON_ERROR_WARNING =
	"--emitOnError was specified, and diagnostics were found. The compiler may crash!" +
	"\nIf so, please check whether resolving the errors fixes the crash, before reporting it as a bug.";

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

	const reverseSymlinkMap = getReverseSymlinkMap(program);

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

	let hasWarned = false;
	function warnForEmitOnError() {
		if (hasWarned) return;
		LogService.warn(EMIT_ON_ERROR_WARNING);
		hasWarned = true;
	}

	if (DiagnosticService.hasErrors()) {
		if (data.projectOptions.emitOnError) warnForEmitOnError();
		else return { emitSkipped: true, diagnostics: DiagnosticService.flush() };
	}

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

	if (DiagnosticService.hasErrors()) {
		// No warnForEmitOnError() here, since transformer diagnostics shouldn't have a way to cause a compiler crash
		if (!data.projectOptions.emitOnError) return { emitSkipped: true, diagnostics: DiagnosticService.flush() };
	}

	const typeChecker = proxyProgram.getTypeChecker();
	const services = createTransformServices(proxyProgram, typeChecker, data);

	for (let i = 0; i < sourceFiles.length; i++) {
		const sourceFile = proxyProgram.getSourceFile(sourceFiles[i].fileName);
		assert(sourceFile);
		const progress = `${i + 1}/${sourceFiles.length}`.padStart(progressMaxLength);
		benchmarkIfVerbose(`${progress} compile ${path.relative(process.cwd(), sourceFile.fileName)}`, () => {
			DiagnosticService.addDiagnostics(ts.getPreEmitDiagnostics(proxyProgram, sourceFile));
			DiagnosticService.addDiagnostics(getCustomPreEmitDiagnostics(data, sourceFile));
			if (DiagnosticService.hasErrors()) {
				if (data.projectOptions.emitOnError) warnForEmitOnError();
				else return;
			}

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
				reverseSymlinkMap,
				runtimeLibRbxPath,
				typeChecker,
				projectType,
				sourceFile,
			);

			const luauAST = transformSourceFile(transformState, sourceFile);
			if (DiagnosticService.hasErrors()) {
				if (data.projectOptions.emitOnError) warnForEmitOnError();
				else return;
			}

			const source = renderAST(luauAST);

			fileWriteQueue.push({ sourceFile, source });
		});
	}

	if (DiagnosticService.hasErrors()) {
		// No warnForEmitOnError() here, since file writing itself will be fine, even with diagnostics
		if (!data.projectOptions.emitOnError) return { emitSkipped: true, diagnostics: DiagnosticService.flush() };
	}

	const emittedFiles = new Array<string>();
	if (fileWriteQueue.length > 0) {
		benchmarkIfVerbose("writing compiled files", () => {
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
					proxyProgram.emit(sourceFile, ts.sys.writeFile, undefined, true, {
						afterDeclarations: [transformTypeReferenceDirectives, transformPaths],
					});
				}
			}
		});
	}

	program.emitBuildInfo();

	return { emittedFiles, emitSkipped: false, diagnostics: DiagnosticService.flush() };
}
