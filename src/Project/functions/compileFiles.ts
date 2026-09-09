import { renderAST } from "@roblox-ts/luau-ast";
import { PathTranslator } from "@roblox-ts/path-translator";
import { NetworkType, RbxPath, RojoResolver } from "@roblox-ts/rojo-resolver";
import fs from "fs-extra";
import path from "path";
import { checkFileName } from "Project/functions/checkFileName";
import { checkRojoConfig } from "Project/functions/checkRojoConfig";
import { createNodeModulesPathMapping } from "Project/functions/createNodeModulesPathMapping";
import { printSourceFileWithTraceMap } from "Project/functions/printSourceFileWithTraceMap";
import { renderASTWithSourceMap } from "Project/functions/renderASTWithSourceMap";
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
	const emitDeclarations = ts.getEmitDeclarations(compilerOptions);

	const multiTransformState = new MultiTransformState();

	const outDir = compilerOptions.outDir!;

	const rojoResolver =
		data.rojoResolver ??
		(data.rojoConfigPath ? RojoResolver.fromPath(data.rojoConfigPath) : RojoResolver.synthetic(outDir));

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

	const fileWriteQueue = new Array<{ sourceFile: ts.SourceFile; source: string; sourceMapJson?: string }>();
	const progressMaxLength = `${sourceFiles.length}/${sourceFiles.length}`.length;

	const originalSourceTexts = new Map<string, string>();
	let proxyProgram = program;
	let pluginAfterDeclarations: ts.CustomTransformers["afterDeclarations"];

	if (compilerOptions.plugins && compilerOptions.plugins.length > 0) {
		benchmarkIfVerbose(`running transformers..`, () => {
			const pluginConfigs = getPluginConfigs(data.tsConfigPath);
			const transformerList = createTransformerList(program, pluginConfigs, data.projectPath);
			pluginAfterDeclarations = transformerList.afterDeclarations;
			const transformers = flattenIntoTransformers(transformerList);
			if (transformers.length > 0) {
				const { service, updateFile, updateProgram } = (data.transformerWatcher ??=
					createTransformerWatcher(program));
				updateProgram(program);
				if (compilerOptions.sourceMap) {
					for (const sourceFile of sourceFiles) {
						originalSourceTexts.set(sourceFile.fileName, sourceFile.text);
					}
				}
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
						const { text: source, traceMap } = printSourceFileWithTraceMap(sourceFile, compilerOptions);
						if (traceMap) {
							multiTransformState.reprintTraceMaps.set(sourceFile.fileName, traceMap);
						}
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
		const sourceFile = proxyProgram.getSourceFile(sourceFiles[i].fileName);
		assert(sourceFile);
		const progress = `${i + 1}/${sourceFiles.length}`.padStart(progressMaxLength);
		benchmarkIfVerbose(`${progress} compile ${path.relative(process.cwd(), sourceFile.fileName)}`, () => {
			DiagnosticService.addDiagnostics(ts.getPreEmitDiagnostics(proxyProgram, sourceFile));
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

			if (compilerOptions.sourceMap) {
				const outPath = pathTranslator.getOutputPath(sourceFile.fileName);
				const sourceMapSource = path.relative(path.dirname(outPath), sourceFile.fileName).split(path.sep).join("/");
				const result = renderASTWithSourceMap(
					luauAST,
					transformState.sourcePositionMap,
					transformState.sourceEndPositionMap,
					sourceMapSource,
					path.basename(outPath),
					originalSourceTexts.get(sourceFile.fileName) ?? sourceFile.text,
				);
				fileWriteQueue.push({ sourceFile, source: result.code, sourceMapJson: JSON.stringify(result.map) });
			} else {
				fileWriteQueue.push({ sourceFile, source: renderAST(luauAST) });
			}
		});
	}

	if (DiagnosticService.hasErrors()) return { emitSkipped: true, diagnostics: DiagnosticService.flush() };

	// declaration errors must not leave Luau and declaration outputs from different builds
	const declarationWrites = new Map<string, string>();
	if (emitDeclarations) {
		const afterDeclarations = [
			...(pluginAfterDeclarations ?? []),
			transformTypeReferenceDirectives,
			transformPathsTransformer(program, {}),
		];
		for (const { sourceFile } of fileWriteQueue) {
			const result = proxyProgram.emit(
				sourceFile,
				(fileName, text) => declarationWrites.set(fileName, text),
				undefined,
				true,
				{ afterDeclarations },
			);
			DiagnosticService.addDiagnostics(result.diagnostics);
		}
	}

	if (DiagnosticService.hasErrors()) return { emitSkipped: true, diagnostics: DiagnosticService.flush() };

	const emittedFiles = new Array<string>();
	if (fileWriteQueue.length > 0) {
		benchmarkIfVerbose("writing compiled files", () => {
			for (const { sourceFile, source, sourceMapJson } of fileWriteQueue) {
				const outPath = pathTranslator.getOutputPath(sourceFile.fileName);
				if (
					!data.projectOptions.writeOnlyChanged ||
					!fs.pathExistsSync(outPath) ||
					fs.readFileSync(outPath).toString() !== source
				) {
					fs.outputFileSync(outPath, source);
					emittedFiles.push(outPath);
				}
				const mapPath = outPath + ".map";
				if (sourceMapJson !== undefined) {
					if (
						!data.projectOptions.writeOnlyChanged ||
						!fs.existsSync(mapPath) ||
						fs.readFileSync(mapPath, "utf8") !== sourceMapJson
					) {
						fs.outputFileSync(mapPath, sourceMapJson);
						emittedFiles.push(mapPath);
					}
				}
			}

			for (const [fileName, text] of declarationWrites) {
				if (
					!data.projectOptions.writeOnlyChanged ||
					!fs.pathExistsSync(fileName) ||
					fs.readFileSync(fileName, "utf8") !== text
				) {
					fs.outputFileSync(fileName, text);
				}
			}
		});
	}

	if (!compilerOptions.sourceMap) {
		for (const { sourceFile } of fileWriteQueue) {
			fs.removeSync(pathTranslator.getOutputPath(sourceFile.fileName) + ".map");
		}
	}

	program.emitBuildInfo();

	return { emittedFiles, emitSkipped: false, diagnostics: DiagnosticService.flush() };
}
