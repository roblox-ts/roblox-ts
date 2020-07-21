import ts, { SourceFile } from "byots";
import fs from "fs-extra";
import { renderAST } from "LuauRenderer";
import path from "path";
import { createParseConfigFileHost } from "Project/util/createParseConfigFileHost";
import { createReadBuildProgramHost } from "Project/util/createReadBuildProgramHost";
import { getCustomPreEmitDiagnostics } from "Project/util/getCustomPreEmitDiagnostics";
import { validateCompilerOptions } from "Project/util/validateCompilerOptions";
import { LogService } from "Shared/classes/LogService";
import { PathTranslator } from "Shared/classes/PathTranslator";
import { NetworkType, RbxPath, RojoConfig } from "Shared/classes/RojoConfig";
import { COMPILER_VERSION, PACKAGE_ROOT, ProjectType } from "Shared/constants";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { ProjectError } from "Shared/errors/ProjectError";
import { assert } from "Shared/util/assert";
import { benchmarkSync } from "Shared/util/benchmark";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import {
	GlobalSymbols,
	MacroManager,
	MultiTransformState,
	RoactSymbolManager,
	transformSourceFile,
	TransformState,
} from "TSTransformer";

const DEFAULT_PROJECT_OPTIONS: ProjectOptions = {
	includePath: "",
	rojo: "",
};

const LIB_PATH = path.join(PACKAGE_ROOT, "lib");

function findAncestorDir(dirs: Array<string>) {
	dirs = dirs.map(path.normalize).map(v => (v.endsWith(path.sep) ? v : v + path.sep));
	let currentDir = dirs[0];
	while (!dirs.every(v => v.startsWith(currentDir))) {
		currentDir = path.join(currentDir, "..");
	}
	return currentDir;
}

/** The options of the project. */
export interface ProjectOptions {
	/** The path to the include directory. */
	includePath: string;

	/** The path to the rojo configuration. */
	rojo: string;
}

/** Represents a roblox-ts project. */
export class Project {
	public readonly program: ts.EmitAndSemanticDiagnosticsBuilderProgram;
	public readonly projectPath: string;
	public readonly nodeModulesPath: string;

	private readonly verbose: boolean;
	private readonly projectOptions: ProjectOptions;
	private readonly compilerOptions: ts.CompilerOptions;
	private readonly typeChecker: ts.TypeChecker;
	private readonly globalSymbols: GlobalSymbols;
	private readonly macroManager: MacroManager;
	private readonly roactSymbolManager: RoactSymbolManager | undefined;
	private readonly rojoConfig: RojoConfig;
	private readonly pathTranslator: PathTranslator;
	private readonly pkgVersion: string | undefined;
	private readonly runtimeLibRbxPath: RbxPath | undefined;
	private readonly nodeModulesRbxPath: RbxPath | undefined;
	private readonly includePath: string;
	private readonly rootDir: string;

	public readonly projectType: ProjectType;

	private readonly nodeModulesPathMapping = new Map<string, string>();

	constructor(tsConfigPath: string, opts: Partial<ProjectOptions>, verbose: boolean) {
		this.verbose = verbose;
		this.projectOptions = Object.assign({}, DEFAULT_PROJECT_OPTIONS, opts);

		// set up project paths
		this.projectPath = path.dirname(tsConfigPath);

		const pkgJsonPath = ts.findPackageJson(this.projectPath, (ts.sys as unknown) as ts.LanguageServiceHost);
		if (!pkgJsonPath) {
			throw new ProjectError("Unable to find package.json");
		}

		const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath).toString());
		this.pkgVersion = pkgJson.version;

		this.nodeModulesPath = path.join(path.dirname(pkgJsonPath), "node_modules", "@rbxts");

		const rojoConfigPath = RojoConfig.findRojoConfigFilePath(this.projectPath, this.projectOptions.rojo);
		if (rojoConfigPath) {
			this.rojoConfig = RojoConfig.fromPath(rojoConfigPath);
			if (this.rojoConfig.isGame()) {
				this.projectType = ProjectType.Game;
			} else {
				this.projectType = ProjectType.Model;
			}
		} else {
			this.rojoConfig = RojoConfig.synthetic(this.projectPath);
			this.projectType = ProjectType.Package;
		}

		// intentionally use || here for empty string case
		this.includePath = path.resolve(this.projectOptions.includePath || path.join(this.projectPath, "include"));

		// validates and establishes runtime library
		if (this.projectType !== ProjectType.Package) {
			const runtimeFsPath = path.join(this.includePath, "RuntimeLib.lua");
			const runtimeLibRbxPath = this.rojoConfig.getRbxPathFromFilePath(runtimeFsPath);
			if (!runtimeLibRbxPath) {
				throw new ProjectError(
					`A Rojo project file was found ( ${path.relative(
						this.projectPath,
						rojoConfigPath!,
					)} ), but contained no data for include folder!`,
				);
			} else if (this.rojoConfig.getNetworkType(runtimeLibRbxPath) !== NetworkType.Unknown) {
				throw new ProjectError(`Runtime library cannot be in a server-only or client-only container!`);
			} else if (this.rojoConfig.isIsolated(runtimeLibRbxPath)) {
				throw new ProjectError(`Runtime library cannot be in an isolated container!`);
			}
			this.runtimeLibRbxPath = runtimeLibRbxPath;
		}

		if (fs.pathExistsSync(this.nodeModulesPath)) {
			this.nodeModulesRbxPath = this.rojoConfig.getRbxPathFromFilePath(this.nodeModulesPath);

			// map module paths
			for (const pkgName of fs.readdirSync(this.nodeModulesPath)) {
				const pkgPath = path.join(this.nodeModulesPath, pkgName);
				const pkgJsonPath = path.join(pkgPath, "package.json");
				if (fs.existsSync(pkgJsonPath)) {
					const pkgJson = fs.readJSONSync(pkgJsonPath) as { main?: string; typings?: string; types?: string };
					// both "types" and "typings" are valid
					const typesPath = pkgJson.types ?? pkgJson.typings ?? "index.d.ts";
					if (pkgJson.main) {
						this.nodeModulesPathMapping.set(
							path.resolve(pkgPath, typesPath),
							path.resolve(pkgPath, pkgJson.main),
						);
					}
				}
			}
		}

		// obtain TypeScript command line options and validate
		const parsedCommandLine = ts.getParsedCommandLineOfConfigFile(tsConfigPath, {}, createParseConfigFileHost());

		if (parsedCommandLine === undefined) {
			throw new ProjectError("Unable to load TS program!");
		}

		if (parsedCommandLine.errors.length > 0) {
			throw new DiagnosticError(parsedCommandLine.errors);
		}

		this.compilerOptions = parsedCommandLine.options;
		validateCompilerOptions(this.compilerOptions, this.nodeModulesPath);

		const host = ts.createIncrementalCompilerHost(this.compilerOptions);

		let rojoHash = "";
		if (rojoConfigPath) {
			assert(host.createHash);
			rojoHash = "-" + host.createHash(fs.readFileSync(rojoConfigPath).toString());
		}

		// super hack!
		// we set `ts.version` so that new versions of roblox-ts trigger full re-compile for incremental mode
		// rojoHash makes it so that changes to the rojo config will trigger full re-compile

		// eslint-disable-next-line @typescript-eslint/ban-ts-ignore
		// @ts-ignore
		ts.version = COMPILER_VERSION + rojoHash;

		this.program = ts.createEmitAndSemanticDiagnosticsBuilderProgram(
			parsedCommandLine.fileNames,
			this.compilerOptions,
			host,
			ts.readBuilderProgram(this.compilerOptions, createReadBuildProgramHost()),
		);

		this.typeChecker = this.program.getProgram().getDiagnosticsProducingTypeChecker();

		this.globalSymbols = new GlobalSymbols(this.typeChecker);
		this.macroManager = new MacroManager(this.program.getProgram(), this.typeChecker, this.nodeModulesPath);

		const roactIndexSourceFile = this.program.getSourceFile(path.join(this.nodeModulesPath, "roact", "index.d.ts"));
		if (roactIndexSourceFile) {
			this.roactSymbolManager = new RoactSymbolManager(this.typeChecker, roactIndexSourceFile);
		}

		this.rootDir = findAncestorDir([this.program.getProgram().getCommonSourceDirectory(), ...this.getRootDirs()]);

		// create `PathTranslator` to ensure paths of input, output, and include paths are relative to project
		const buildInfoPath = ts.getTsBuildInfoEmitOutputFilePath(this.compilerOptions);
		this.pathTranslator = new PathTranslator(
			this.rootDir,
			this.compilerOptions.outDir!,
			buildInfoPath ? path.normalize(buildInfoPath) : undefined,
			this.compilerOptions.declaration === true,
		);
	}

	private isOutputFileOrphaned(filePath: string) {
		const inputPaths = this.pathTranslator.getInputPaths(filePath);
		for (const path of inputPaths) {
			if (fs.pathExistsSync(path)) {
				return false;
			}
		}

		if (this.pathTranslator.buildInfoOutputPath === filePath) {
			return false;
		}

		return true;
	}

	/** cleanup a directory recursively */
	private cleanupDirRecursively(dir: string) {
		if (fs.pathExistsSync(dir)) {
			for (const name of fs.readdirSync(dir)) {
				const itemPath = path.join(dir, name);
				if (fs.statSync(itemPath).isDirectory()) {
					this.cleanupDirRecursively(itemPath);
				}
				if (this.isOutputFileOrphaned(itemPath)) {
					fs.removeSync(itemPath);
					if (this.verbose) LogService.writeLine(`remove ${itemPath}`);
				}
			}
		}
	}

	/** cleans up 'orphaned' files - Files which don't belong to any source file in the out directory. */
	public cleanup() {
		const outDir = this.pathTranslator.outDir;
		if (fs.pathExistsSync(outDir)) {
			this.cleanupDirRecursively(outDir);
		}
	}

	/**
	 * generates a `Set<string>` of paths for changed files + dependencies
	 *
	 * if `incremental == false`, this will return all project files
	 *
	 * if `assumeChangesOnlyAffectDirectDependencies == false`, this will only check direct dependencies
	 */
	public getChangedFilePaths() {
		const buildState = this.program.getState();

		// buildState.referencedMap is sourceFile -> files that this file imports
		// but we need sourceFile -> files that import this file
		const reversedReferencedMap = new Map<string, Set<string>>();
		buildState.referencedMap?.forEach((referencedSet, filePath) => {
			referencedSet.forEach((_, refFilePath) => {
				getOrSetDefault(reversedReferencedMap, refFilePath, () => new Set()).add(filePath);
			});
		});

		const changedFilesSet = new Set<string>();

		const search = (filePath: string) => {
			changedFilesSet.add(filePath);
			reversedReferencedMap.get(filePath)?.forEach(refFilePath => {
				if (!changedFilesSet.has(refFilePath)) {
					changedFilesSet.add(refFilePath);
					if (this.compilerOptions.assumeChangesOnlyAffectDirectDependencies !== true) {
						search(refFilePath);
					}
				}
			});
		};

		buildState.changedFilesSet?.forEach((_, fileName) => search(fileName));

		return changedFilesSet;
	}

	public getRootDirs() {
		const rootDirs = this.compilerOptions.rootDir ? [this.compilerOptions.rootDir] : this.compilerOptions.rootDirs;
		assert(rootDirs);
		return rootDirs;
	}

	public copyInclude() {
		this.benchmark("copy include files", () => {
			fs.copySync(LIB_PATH, this.includePath, { dereference: true });
		});
	}

	public copyFiles(sources: Set<string>) {
		this.benchmark("copy non-compiled files", () => {
			assert(this.compilerOptions.outDir);
			for (const source of sources) {
				fs.copySync(source, path.join(this.compilerOptions.outDir, path.relative(this.rootDir, source)), {
					filter: src => !src.endsWith(ts.Extension.Ts) && !src.endsWith(ts.Extension.Tsx),
					dereference: true,
				});
			}
		});
	}

	private benchmark(name: string, callback: () => void) {
		if (this.verbose) {
			benchmarkSync(name, callback);
		} else {
			callback();
		}
	}

	public getChangedSourceFiles() {
		const sourceFiles = new Array<ts.SourceFile>();
		for (const fileName of this.getChangedFilePaths()) {
			const sourceFile = this.program.getSourceFile(fileName);
			assert(sourceFile);
			if (!sourceFile.isDeclarationFile && !ts.isJsonSourceFile(sourceFile)) {
				sourceFiles.push(sourceFile);
			}
		}
		return sourceFiles;
	}

	public compileAll() {
		this.compileFiles(this.getChangedSourceFiles());
		this.program.getProgram().emitBuildInfo();
		this.copyInclude();
		this.copyFiles(new Set(this.getRootDirs()));
	}

	/**
	 * 'transpiles' TypeScript project into a logically identical Luau project.
	 *
	 * writes rendered Luau source to the out directory.
	 */
	public compileFiles(sourceFiles: Array<SourceFile>) {
		const multiTransformState = new MultiTransformState();
		const totalDiagnostics = new Array<ts.Diagnostic>();

		const fileWriteQueue = new Array<{ sourceFile: ts.SourceFile; source: string }>();

		const progressMaxLength = `${sourceFiles.length}/${sourceFiles.length}`.length;
		for (let i = 0; i < sourceFiles.length; i++) {
			const sourceFile = sourceFiles[i];
			const progress = `${i + 1}/${sourceFiles.length}`.padStart(progressMaxLength);

			this.benchmark(`${progress} compile ${path.relative(process.cwd(), sourceFile.fileName)}`, () => {
				const customPreEmitDiagnostics = getCustomPreEmitDiagnostics(sourceFile);
				totalDiagnostics.push(...customPreEmitDiagnostics);
				if (totalDiagnostics.length > 0) return;

				const preEmitDiagnostics = ts.getPreEmitDiagnostics(this.program.getProgram(), sourceFile);
				totalDiagnostics.push(...preEmitDiagnostics);
				if (totalDiagnostics.length > 0) return;

				// create a new transform state for the file
				const transformState = new TransformState(
					this.compilerOptions,
					multiTransformState,
					this.rojoConfig,
					this.pathTranslator,
					this.runtimeLibRbxPath,
					this.nodeModulesPath,
					this.nodeModulesRbxPath,
					this.nodeModulesPathMapping,
					this.typeChecker,
					this.typeChecker.getEmitResolver(sourceFile),
					this.globalSymbols,
					this.macroManager,
					this.roactSymbolManager,
					this.projectType,
					this.pkgVersion,
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
			this.benchmark("writing compiled files", () => {
				for (const fileInfo of fileWriteQueue) {
					const { sourceFile, source } = fileInfo;
					const outPath = this.pathTranslator.getOutputPath(sourceFile.fileName);
					fs.outputFileSync(outPath, source);
					if (this.compilerOptions.declaration) {
						this.program.emit(sourceFile, ts.sys.writeFile, undefined, true);
					}
				}
			});
		}
	}
}
