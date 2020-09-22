import ts from "byots";
import fs from "fs-extra";
import path from "path";
import { compileFile } from "Project/functions/compileFiles";
import { findAncestorDir } from "Project/functions/findAncestorDir";
import { getRootDirs } from "Project/functions/getRootDirs";
import { validateCompilerOptions } from "Project/functions/validateCompilerOptions";
import { ProjectData, ProjectFlags, ProjectOptions, ProjectServices } from "Project/types";
import { createParseConfigFileHost } from "Project/util/createParseConfigFileHost";
import { createReadBuildProgramHost } from "Project/util/createReadBuildProgramHost";
import { PathTranslator } from "Shared/classes/PathTranslator";
import { NetworkType, RojoResolver } from "Shared/classes/RojoResolver";
import { COMPILER_VERSION, NODE_MODULES, ProjectType, RBXTS_SCOPE } from "Shared/constants";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { ProjectError } from "Shared/errors/ProjectError";
import { assert } from "Shared/util/assert";
import { GlobalSymbols, MacroManager, MultiTransformState, RoactSymbolManager } from "TSTransformer";

const DEFAULT_PROJECT_OPTIONS: ProjectOptions = {
	includePath: "",
	rojo: "",
	type: undefined,
};

export function createProjectData(
	tsConfigPath: string,
	opts: Partial<ProjectOptions>,
	flags: ProjectFlags,
): ProjectData {
	const projectOptions = Object.assign({}, DEFAULT_PROJECT_OPTIONS, opts);
	const projectPath = path.dirname(tsConfigPath);

	const pkgJsonPath = ts.findPackageJson(projectPath, (ts.sys as unknown) as ts.LanguageServiceHost);
	if (!pkgJsonPath) {
		throw new ProjectError("Unable to find package.json");
	}

	let isPackage = false;
	let pkgVersion = "";
	try {
		const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath).toString());
		isPackage = (pkgJson.name ?? "").startsWith(RBXTS_SCOPE + "/");
		pkgVersion = pkgJson.version;
	} catch (e) {}

	// intentionally use || here for empty string case
	const includePath = path.resolve(projectOptions.includePath || path.join(projectPath, "include"));

	const nodeModulesPath = path.join(path.dirname(pkgJsonPath), NODE_MODULES, RBXTS_SCOPE);
	const nodeModulesPathMapping = new Map<string, string>();
	if (fs.pathExistsSync(nodeModulesPath)) {
		// map module paths
		for (const pkgName of fs.readdirSync(nodeModulesPath)) {
			const pkgPath = path.join(nodeModulesPath, pkgName);
			const pkgJsonPath = path.join(pkgPath, "package.json");
			if (fs.existsSync(pkgJsonPath)) {
				const pkgJson = fs.readJSONSync(pkgJsonPath) as { main?: string; typings?: string; types?: string };
				// both "types" and "typings" are valid
				const typesPath = pkgJson.types ?? pkgJson.typings ?? "index.d.ts";
				if (pkgJson.main) {
					nodeModulesPathMapping.set(path.resolve(pkgPath, typesPath), path.resolve(pkgPath, pkgJson.main));
				}
			}
		}
	}

	const rojoConfigPath = projectOptions.rojo
		? path.resolve(projectOptions.rojo)
		: RojoResolver.findRojoConfigFilePath(projectPath);

	return {
		tsConfigPath,
		includePath,
		isPackage,
		noInclude: flags.noInclude,
		nodeModulesPath,
		nodeModulesPathMapping,
		pkgVersion,
		projectOptions,
		projectPath,
		rojoConfigPath,
	};
}

export function createProjectServices(program: ts.BuilderProgram, data: ProjectData): ProjectServices {
	const compilerOptions = program.getCompilerOptions();
	const typeChecker = program.getProgram().getDiagnosticsProducingTypeChecker();

	const globalSymbols = new GlobalSymbols(typeChecker);

	const macroManager = new MacroManager(program.getProgram(), typeChecker, data.nodeModulesPath);

	const rootDir = findAncestorDir([program.getProgram().getCommonSourceDirectory(), ...getRootDirs(program)]);
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

function getParsedCommandLine(data: ProjectData) {
	const parsedCommandLine = ts.getParsedCommandLineOfConfigFile(data.tsConfigPath, {}, createParseConfigFileHost());
	if (parsedCommandLine === undefined) {
		throw new ProjectError("Unable to load TS program!");
	} else if (parsedCommandLine.errors.length > 0) {
		throw new DiagnosticError(parsedCommandLine.errors);
	}
	validateCompilerOptions(parsedCommandLine.options, data.nodeModulesPath);
	return parsedCommandLine;
}

function createCompilerHost(data: ProjectData, compilerOptions: ts.CompilerOptions) {
	const host = ts.createIncrementalCompilerHost(compilerOptions);

	let rojoHash = "";
	if (data.rojoConfigPath) {
		assert(host.createHash);
		rojoHash = "-" + host.createHash(fs.readFileSync(data.rojoConfigPath).toString());
	}

	// super hack!
	// we set `ts.version` so that new versions of roblox-ts trigger full re-compile for incremental mode
	// rojoHash makes it so that changes to the rojo config will trigger full re-compile

	// eslint-disable-next-line @typescript-eslint/ban-ts-ignore
	// @ts-ignore
	ts.version = COMPILER_VERSION + rojoHash;

	return host;
}

const SKIP_EMIT: ts.EmitResult = { diagnostics: [], emitSkipped: true };

function inferProjectType(data: ProjectData, rojoResolver: RojoResolver): ProjectType {
	if (data.isPackage) {
		return ProjectType.Package;
	} else if (rojoResolver.isGame) {
		return ProjectType.Game;
	} else {
		return ProjectType.Model;
	}
}

function getRuntimeLibRbxPath(data: ProjectData, projectType: ProjectType, rojoResolver: RojoResolver) {
	if (projectType !== ProjectType.Package) {
		const runtimeFsPath = path.join(data.includePath, "RuntimeLib.lua");
		const runtimeLibRbxPath = rojoResolver.getRbxPathFromFilePath(runtimeFsPath);
		if (!runtimeLibRbxPath) {
			throw new ProjectError(`Rojo config contained no data for include folder!`);
		} else if (rojoResolver.getNetworkType(runtimeLibRbxPath) !== NetworkType.Unknown) {
			throw new ProjectError(`Runtime library cannot be in a server-only or client-only container!`);
		} else if (rojoResolver.isIsolated(runtimeLibRbxPath)) {
			throw new ProjectError(`Runtime library cannot be in an isolated container!`);
		}
		return runtimeLibRbxPath;
	}
}

export function getPreEmitInfo(data: ProjectData) {
	const multiTransformState = new MultiTransformState();
	const rojoResolver = data.rojoConfigPath
		? RojoResolver.fromPath(data.rojoConfigPath)
		: RojoResolver.synthetic(data.projectPath);
	const projectType = data.projectOptions.type ?? inferProjectType(data, rojoResolver);
	const runtimeLibRbxPath = getRuntimeLibRbxPath(data, projectType, rojoResolver);
	const nodeModulesRbxPath = fs.pathExistsSync(data.nodeModulesPath)
		? rojoResolver.getRbxPathFromFilePath(data.nodeModulesPath)
		: undefined;
	return { multiTransformState, rojoResolver, projectType, runtimeLibRbxPath, nodeModulesRbxPath };
}

function createProgramFactory(
	data: ProjectData,
	fileNames: Array<string>,
	compilerOptions: ts.CompilerOptions,
	host: ts.CompilerHost,
) {
	return (
		files: ReadonlyArray<string> = fileNames,
		options = compilerOptions,
		compilerHost = host,
		oldProgram = ts.readBuilderProgram(compilerOptions, createReadBuildProgramHost()),
	) => {
		const program = ts.createEmitAndSemanticDiagnosticsBuilderProgram(files, options, compilerHost, oldProgram);
		const services = createProjectServices(program, data);

		const {
			multiTransformState,
			rojoResolver,
			projectType,
			runtimeLibRbxPath,
			nodeModulesRbxPath,
		} = getPreEmitInfo(data);

		function emit(
			targetSourceFile?: ts.SourceFile,
			_writeFile?: ts.WriteFileCallback,
			_cancellationToken?: ts.CancellationToken,
			emitOnlyDtsFiles?: boolean,
			_customTransformers?: ts.CustomTransformers,
		): ts.EmitResult {
			if (emitOnlyDtsFiles || !targetSourceFile || targetSourceFile.isDeclarationFile) return SKIP_EMIT;
			return compileFile(
				program,
				data,
				services,
				targetSourceFile,
				multiTransformState,
				rojoResolver,
				projectType,
				runtimeLibRbxPath,
				nodeModulesRbxPath,
			);
		}

		const origGetProgram = program.getProgram;
		program.getProgram = () => {
			const subProgram = origGetProgram();
			subProgram.emit = emit;
			return subProgram;
		};

		return program;
	};
}

export function createProjectProgram(data: ProjectData) {
	const { fileNames, options } = getParsedCommandLine(data);
	const createProgram = createProgramFactory(data, fileNames, options, createCompilerHost(data, options));
	return createProgram();
}

export function createProjectWatchProgram(data: ProjectData) {
	const { fileNames, options } = getParsedCommandLine(data);
	const createProgram = createProgramFactory(data, fileNames, options, createCompilerHost(data, options));
	return ts.createWatchProgram(
		ts.createWatchCompilerHostOfFilesAndCompilerOptions({
			createProgram,
			rootFiles: fileNames,
			options,
			system: ts.sys,
			watchOptions: undefined,
			reportDiagnostic: ts.createDiagnosticReporter(ts.sys, true),
			reportWatchStatus: ts.createWatchStatusReporter(ts.sys, true),
		}),
	);
}
