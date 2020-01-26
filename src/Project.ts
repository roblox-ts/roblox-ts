import fs from "fs-extra";
import klaw from "klaw";
import { minify } from "luamin";
import path from "path";
import * as ts from "ts-morph";
import { addEvent } from "./analytics";
import { compileSourceFile } from "./compiler";
import { CompilerState } from "./CompilerState";
import { DTS_EXT, JSON_EXT, LUA_EXT, TSX_EXT, TS_EXT } from "./constants";
import { DiagnosticError } from "./errors/DiagnosticError";
import { LoggableError } from "./errors/LoggableError";
import { ProjectError, ProjectErrorType } from "./errors/ProjectError";
import { RojoProjectError } from "./errors/RojoProjectError";
import { warn } from "./errors/Warning";
import { NetworkType, RojoProject } from "./RojoProject";
import {
	cleanDirRecursive,
	copyLuaFiles,
	isPathAncestorOf,
	shouldCleanRelative,
	transformPathToLua,
} from "./utility/fs";
import { isUsedJson, shouldCompileFile } from "./utility/general";
import { red, yellow } from "./utility/text";
import { createFileCompilationWorkers } from "./workers";

const MINIMUM_RBX_TYPES_VERSION = 223;

const LIB_PATH = path.resolve(__dirname, "..", "lib");
const ROJO_FILE_REGEX = /^.+\.project\.json$/;
const ROJO_DEFAULT_NAME = "default.project.json";
const ROJO_OLD_NAME = "roblox-project.json";

const IGNORED_DIAGNOSTIC_CODES = new Set([
	2688, // "Cannot find type definition file for '{0}'."
	6054, // "File '{0}' has unsupported extension. The only supported extensions are {1}."
]);

const DEFAULT_PKG_VERSION = "UNKNOWN";

function joinIfNotAbsolute(basePath: string, relativePath: string) {
	if (path.isAbsolute(relativePath)) {
		return relativePath;
	} else {
		return path.join(basePath, relativePath);
	}
}

export enum ProjectType {
	Game,
	Model,
	Package,
}

export interface ProjectOptions {
	project?: string;
	includePath?: string;
	rojo?: string;
	noInclude?: boolean;
	minify?: boolean;
	ci?: boolean;
	threads?: number;
	logTruthyChanges?: boolean;
}

export class Project {
	public configFilePath: string;
	public rojoFilePath: string | undefined;

	public project: ts.Project = {} as ts.Project;
	public readonly rootPath: string;
	public readonly outPath: string;

	private compilerOptions: ts.CompilerOptions = {};
	private projectPath = "";
	private pkgVersion = DEFAULT_PKG_VERSION;

	private rojoProject?: RojoProject;
	private projectType = ProjectType.Package;
	private modulesPath = "";
	private runtimeLibPath = new Array<string>();

	private readonly includePath: string;
	private readonly noInclude: boolean;
	private readonly minify: boolean;
	public readonly logTruthyDifferences: boolean | undefined;

	private readonly rojoOverridePath: string | undefined;
	private readonly runtimeOverride: string | undefined;
	private readonly ci: boolean;
	private readonly luaSourceTransformer: typeof minify | undefined;

	private readonly numThreads: number | undefined;

	public reloadProject() {
		try {
			fs.accessSync(this.configFilePath, fs.constants.R_OK | fs.constants.W_OK);
		} catch (e) {
			throw new ProjectError("Project path does not exist!", ProjectErrorType.BadProjectPath);
		}

		if (fs.statSync(this.configFilePath).isDirectory()) {
			this.configFilePath = path.resolve(this.configFilePath, "tsconfig.json");
		}

		if (!fs.existsSync(this.configFilePath) || !fs.statSync(this.configFilePath).isFile()) {
			throw new ProjectError("Cannot find tsconfig.json!", ProjectErrorType.BadTsConfig);
		}

		this.projectPath = path.resolve(this.configFilePath, "..");

		try {
			this.project = new ts.Project({
				compilerOptions: {
					configFilePath: this.configFilePath,
				},
				tsConfigFilePath: this.configFilePath,
			});
		} catch (e) {
			throw new ProjectError(
				"Could not create project!" + "\n" + "- Is your tsconfig.json valid UTF-8?",
				ProjectErrorType.ProjectFailed,
			);
		}

		const pkgJsonPath = path.join(this.projectPath, "package.json");
		if (fs.pathExistsSync(pkgJsonPath)) {
			try {
				this.pkgVersion = JSON.parse(fs.readFileSync(pkgJsonPath).toString()).version || DEFAULT_PKG_VERSION;
			} catch (e) {}
		}

		const modulesPath = this.getModulesPath(this.projectPath);
		if (!modulesPath) {
			throw new ProjectError("Unable to find node_modules", ProjectErrorType.BadNodeModules);
		}
		this.modulesPath = modulesPath;

		this.compilerOptions = this.project.getCompilerOptions();
		try {
			this.validateCompilerOptions();
		} catch (e) {
			if (e instanceof LoggableError) {
				e.log(this.projectPath);
				process.exit(1);
			} else {
				throw e;
			}
		}
	}

	public getSourceFile(fileNameOrPath: string) {
		return this.project.getSourceFile(fileNameOrPath);
	}

	public reloadRojo() {
		if (this.rojoFilePath) {
			try {
				this.rojoProject = RojoProject.fromPathSync(this.rojoFilePath);
			} catch (e) {
				if (e instanceof RojoProjectError) {
					e.log();
				}
			}
		}

		if (this.rojoFilePath && this.rojoProject) {
			const runtimeFsPath = path.join(this.includePath, "RuntimeLib.lua");
			const runtimeLibPath = this.rojoProject.getRbxFromFile(runtimeFsPath).path;
			if (!runtimeLibPath) {
				throw new ProjectError(
					`A Rojo project file was found ( ${this.rojoFilePath} ), but contained no data for include folder!`,
					ProjectErrorType.BadRojoInclude,
				);
			} else if (this.rojoProject.getNetworkType(runtimeFsPath) !== NetworkType.Unknown) {
				throw new ProjectError(
					`Runtime library cannot be in a server-only or client-only container!`,
					ProjectErrorType.BadRojoInclude,
				);
			} else if (this.rojoProject.isIsolated(runtimeFsPath)) {
				throw new ProjectError(
					`Runtime library cannot be in an isolated container!`,
					ProjectErrorType.BadRojoInclude,
				);
			}
			let type: ProjectType.Game | ProjectType.Model;
			if (this.rojoProject.isGame()) {
				type = ProjectType.Game;
			} else {
				type = ProjectType.Model;
			}
			this.projectType = type;
			this.runtimeLibPath = runtimeLibPath;
		} else {
			this.projectType = ProjectType.Package;
			this.runtimeLibPath = [];
		}
	}

	constructor(public readonly opts: ProjectOptions = {}) {
		// cli mode
		if (opts.project !== undefined && opts.includePath !== undefined && opts.rojo !== undefined) {
			this.configFilePath = path.resolve(opts.project);
			this.reloadProject();

			this.noInclude = opts.noInclude === true;
			this.includePath = joinIfNotAbsolute(this.projectPath, opts.includePath);
			this.minify = opts.minify === true;
			this.luaSourceTransformer = this.minify ? minify : undefined;
			this.rojoOverridePath = opts.rojo !== "" ? joinIfNotAbsolute(this.projectPath, opts.rojo) : undefined;

			this.ci = opts.ci === true;
			this.numThreads = opts.threads;
			this.logTruthyDifferences = opts.logTruthyChanges;

			const rootPath = this.compilerOptions.rootDir;
			if (!rootPath) {
				throw new ProjectError("Expected 'rootDir' option in tsconfig.json!", ProjectErrorType.MissingRootDir);
			}
			if (!fs.pathExistsSync(rootPath)) {
				throw new ProjectError(`Unable to find rootDir at ${rootPath}`, ProjectErrorType.MissingRootDir);
			}
			this.rootPath = rootPath;

			const outPath = this.compilerOptions.outDir;
			if (!outPath) {
				throw new ProjectError("Expected 'outDir' option in tsconfig.json!", ProjectErrorType.MissingOutDir);
			}
			this.outPath = outPath;

			// filter out outDir .d.ts files
			const outDir = this.project.getDirectory(outPath);
			if (outDir) {
				this.project.getSourceFiles().forEach(sourceFile => {
					if (outDir.isAncestorOf(sourceFile)) {
						this.project.removeSourceFile(sourceFile);
					}
				});
			}

			try {
				this.validateRbxTypes();
			} catch (e) {
				if (e instanceof LoggableError) {
					e.log(this.projectPath);
					process.exit(1);
				} else {
					throw e;
				}
			}

			this.rojoFilePath = this.getRojoFilePath();
			this.reloadRojo();
		} else {
			this.configFilePath = "";
			this.includePath = "";
			this.noInclude = true;
			this.minify = false;
			this.rootPath = "";
			this.outPath = "";
			this.modulesPath = "";
			this.ci = false;

			this.runtimeOverride = "local TS = ...; -- link to runtime library";

			this.project = new ts.Project({
				compilerOptions: {
					allowSyntheticDefaultImports: true,
					baseUrl: "src",
					declaration: false,
					downlevelIteration: true,
					isolatedModules: true,
					jsx: ts.ts.JsxEmit.React,
					jsxFactory: "Roact.createElement",
					module: ts.ts.ModuleKind.CommonJS,
					noLib: true,
					outDir: "out",
					rootDir: ".",
					strict: true,
					target: ts.ts.ScriptTarget.ES2015,
					typeRoots: ["node_modules/@rbxts"],
				},
				useInMemoryFileSystem: true,
			});
		}
	}

	private getModulesPath(project: string): string | undefined {
		const modulesPath = path.resolve(project, "node_modules");
		if (fs.existsSync(modulesPath)) {
			return modulesPath;
		}
		const parent = path.resolve(project, "..");
		if (parent !== project) {
			return this.getModulesPath(parent);
		}
	}

	private validateCompilerOptions() {
		const opts = this.compilerOptions;

		const errors = new Array<string>();

		// required compiler options
		if (opts.downlevelIteration !== true) {
			errors.push(`${yellow(`"downlevelIteration"`)} must be ${yellow(`true`)}`);
		}
		if (opts.module !== ts.ts.ModuleKind.CommonJS) {
			errors.push(`${yellow(`"module"`)} must be ${yellow(`"commonjs"`)}`);
		}
		if (opts.noLib !== true) {
			errors.push(`${yellow(`"noLib"`)} must be ${yellow(`true`)}`);
		}
		if (opts.strict !== true) {
			errors.push(`${yellow(`"strict"`)} must be ${yellow(`true`)}`);
		}
		if (opts.target !== ts.ts.ScriptTarget.ES2015) {
			errors.push(`${yellow(`"target"`)} must be ${yellow(`"es6"`)}`);
		}
		if (opts.allowSyntheticDefaultImports !== true) {
			errors.push(`${yellow(`"allowSyntheticDefaultImports"`)} must be ${yellow(`true`)}`);
		}
		if (opts.declaration !== true && opts.isolatedModules !== true) {
			errors.push(`${yellow(`"isolatedModules"`)} must be ${yellow(`true`)}`);
		}

		let typesFound = false;
		if (opts.typeRoots) {
			const typesPath = path.resolve(this.modulesPath, "@rbxts");
			for (const typeRoot of opts.typeRoots) {
				if (path.normalize(typeRoot) === typesPath) {
					typesFound = true;
					break;
				}
			}
		}

		if (!typesFound) {
			errors.push(`${yellow(`"typeRoots"`)} must contain ${yellow(`[ "node_modules/@rbxts" ]`)}`);
		}

		// configurable compiler options
		if (opts.rootDir === undefined) {
			errors.push(`${yellow(`"rootDir"`)} must be defined`);
		}
		if (opts.outDir === undefined) {
			errors.push(`${yellow(`"outDir"`)} must be defined`);
		}

		// roact compiler options
		if (opts.jsx !== undefined && opts.jsx !== ts.ts.JsxEmit.React) {
			errors.push(`${yellow(`"jsx"`)} must be ${yellow(`"react"`)} or not defined`);
		}
		if (opts.jsxFactory !== undefined && opts.jsxFactory !== "Roact.createElement") {
			errors.push(`${yellow(`"jsxFactory"`)} must be ${yellow(`"Roact.createElement"`)} or not defined`);
		}

		// throw if errors
		if (errors.length > 0) {
			throw new ProjectError(
				`Invalid "tsconfig.json" configuration!\n` +
					"https://roblox-ts.github.io/docs/quick-start#project-folder-setup" +
					"\n- " +
					errors.join("\n- "),
				ProjectErrorType.BadTsConfig,
			);
		}
	}

	private validateRbxTypes() {
		const pkgJsonPath = path.join(this.modulesPath, "@rbxts", "types", "package.json");
		if (fs.pathExistsSync(pkgJsonPath)) {
			const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath).toString());
			if (pkgJson !== undefined) {
				const versionStr = pkgJson.version;
				if (versionStr !== undefined) {
					const regexMatch = versionStr.match(/\d+$/g);
					if (regexMatch !== null) {
						const patchNumber = Number(regexMatch[0]);
						if (!isNaN(patchNumber)) {
							if (patchNumber >= MINIMUM_RBX_TYPES_VERSION) {
								return;
							} else {
								throw new ProjectError(
									`@rbxts/types is out of date!\n` +
										yellow(`Installed version: 1.0.${patchNumber}\n`) +
										yellow(`Minimum required version: 1.0.${MINIMUM_RBX_TYPES_VERSION}\n`) +
										`Run 'npm i @rbxts/types' to fix this.`,
									ProjectErrorType.BadRbxTypes,
								);
							}
						}
					}
				}
			}
		}

		throw new ProjectError(
			`Could not find @rbxts/types!\n` + `Run 'npm i @rbxts/types' to fix this.`,
			ProjectErrorType.BadRbxTypes,
		);
	}

	private getRojoFilePath() {
		if (this.rojoOverridePath) {
			if (fs.pathExistsSync(this.rojoOverridePath)) {
				return this.rojoOverridePath;
			}
		} else {
			const candidates = new Array<string | undefined>();

			const defaultPath = path.join(this.projectPath, ROJO_DEFAULT_NAME);
			if (fs.pathExistsSync(defaultPath)) {
				candidates.push(defaultPath);
			}

			for (const fileName of fs.readdirSync(this.projectPath)) {
				if (fileName !== ROJO_DEFAULT_NAME && (fileName === ROJO_OLD_NAME || ROJO_FILE_REGEX.test(fileName))) {
					candidates.push(path.join(this.projectPath, fileName));
				}
			}

			if (candidates.length > 1) {
				warn(`Multiple *.project.json files found, using ${candidates[0]}`);
			}
			return candidates[0];
		}
	}

	public async addFile(filePath: string) {
		if (shouldCompileFile(this.project, filePath)) {
			this.project.addSourceFileAtPath(filePath);
		} else {
			await this.copyFile(filePath);
		}
	}

	public async removeFile(filePath: string) {
		const sourceFile = this.project.getSourceFile(filePath);
		if (sourceFile) {
			this.project.removeSourceFile(sourceFile);
		}
		await cleanDirRecursive(
			this.rootPath,
			this.outPath,
			async (src, dest, filePath) => !(await this.originalFileExists(src, dest, filePath)),
		);
	}

	public async refreshFile(filePath: string) {
		const file = this.project.getSourceFile(filePath);
		if (file) {
			try {
				await file.refreshFromFileSystem();
			} catch (e) {
				this.reloadProject();
				throw new ProjectError(
					`ts-morph failed to parse ${path.relative(this.projectPath, filePath)}`,
					ProjectErrorType.TsMorph,
				);
			}
		} else {
			this.project.addSourceFileAtPath(filePath);
		}
	}

	public async originalFileExists(src: string, dest: string, filePath: string) {
		let ext = path.extname(filePath);
		let baseName = path.basename(filePath, ext);
		let subext = path.extname(baseName);
		baseName = path.basename(baseName, subext);
		const relativeToOut = path.dirname(path.relative(dest, filePath));
		const rootPath = path.join(src, relativeToOut);
		if (ext === LUA_EXT) {
			if (baseName === "init") {
				if (await fs.pathExists(path.join(rootPath, "init") + subext + LUA_EXT)) return true;
				if (await fs.pathExists(path.join(rootPath, "index") + subext + TS_EXT)) return true;
				if (await fs.pathExists(path.join(rootPath, "index") + subext + TSX_EXT)) return true;
				if (await fs.pathExists(path.join(rootPath, "init") + subext + TS_EXT)) return true;
				if (await fs.pathExists(path.join(rootPath, "init") + subext + TSX_EXT)) return true;
				if (isUsedJson(this.project, path.join(rootPath, "index") + subext + JSON_EXT)) return true;
			} else {
				if (await fs.pathExists(path.join(rootPath, baseName) + subext + TS_EXT)) return true;
				if (await fs.pathExists(path.join(rootPath, baseName) + subext + TSX_EXT)) return true;
				if (isUsedJson(this.project, path.join(rootPath, baseName) + subext + JSON_EXT)) return true;
			}
		} else if (subext + ext === DTS_EXT) {
			if (!this.compilerOptions.declaration) {
				return false;
			} else {
				ext = subext + ext;
				baseName = path.basename(filePath, ext);
				subext = path.extname(baseName);
				baseName = path.basename(baseName, subext);
				if (await fs.pathExists(path.join(rootPath, baseName) + subext + DTS_EXT)) return true;
				if (await fs.pathExists(path.join(rootPath, baseName) + subext + TS_EXT)) return true;
				if (await fs.pathExists(path.join(rootPath, baseName) + subext + TSX_EXT)) return true;
				if (await fs.pathExists(path.join(rootPath, baseName) + subext + JSON_EXT)) return true;
			}
		} else if (ext === JSON_EXT) {
			if (isUsedJson(this.project, path.join(rootPath, baseName) + subext + JSON_EXT)) return false;
		}
		if (await fs.pathExists(path.join(rootPath, baseName) + subext + ext)) return true;
		return false;
	}

	public async copyIncludeFiles() {
		if (!this.noInclude && this.projectType !== ProjectType.Package) {
			const includeNodeModulesPath = path.join(this.includePath, "node_modules");
			await copyLuaFiles(
				LIB_PATH,
				this.includePath,
				async (src, dest, itemPath) =>
					!isPathAncestorOf(includeNodeModulesPath, itemPath) &&
					(await shouldCleanRelative(src, dest, itemPath)),
			);
		}
	}

	public async copyFile(filePath: string) {
		if (isPathAncestorOf(this.rootPath, filePath)) {
			await fs.copy(filePath, path.join(this.outPath, path.relative(this.rootPath, filePath)), {
				overwrite: true,
			});
		}
	}

	public async copyFiles() {
		await fs.copy(this.rootPath, this.outPath, {
			recursive: true,
			overwrite: true,
			filter: src => {
				const ext = path.extname(src);
				if (ext === TS_EXT) {
					const basename = path.basename(src, ext);
					const subext = path.extname(basename);
					if (subext + ext === DTS_EXT) {
						return this.compilerOptions.declaration === true;
					}
				}
				return !shouldCompileFile(this.project, src);
			},
		});
	}

	public async compileAll() {
		const files = this.project.getSourceFiles();

		process.exitCode = 0;

		if (this.numThreads !== undefined) {
			await createFileCompilationWorkers(this, files, this.numThreads !== 0 ? this.numThreads : undefined);
		} else {
			await this.compileFiles(files);
		}

		if (process.exitCode === 0) {
			await this.copyFiles();
			await this.copyIncludeFiles();
		}
	}

	public async compileFileByPath(filePath: string, compileReferencingFiles = false) {
		if (shouldCompileFile(this.project, filePath)) {
			const sourceFile = this.project.getSourceFile(filePath);
			if (!sourceFile) {
				throw new ProjectError(
					`No source file for Compiler.compileFileByPath() (filePath = ${filePath})`,
					ProjectErrorType.MissingSourceFile,
				);
			}
			const files = new Set([sourceFile]);

			function getReferencingFiles(file: ts.SourceFile) {
				for (const refFile of file.getReferencingSourceFiles()) {
					if (!files.has(refFile)) {
						files.add(refFile);
						getReferencingFiles(refFile);
					}
				}
			}

			if (compileReferencingFiles) {
				getReferencingFiles(sourceFile);
				for (const refFile of sourceFile.getReferencedSourceFiles()) {
					if (path.extname(refFile.getFilePath()) === JSON_EXT) {
						files.add(refFile);
					}
				}
			}

			return this.compileFiles([...files]);
		}
	}

	private createCompilerState(isPlayground = false) {
		return new CompilerState(
			isPlayground,
			this.rootPath,
			this.outPath,
			this.projectType,
			this.runtimeLibPath,
			this.modulesPath,
			this.pkgVersion,
			this.rojoProject,
			this.runtimeOverride,
			this.logTruthyDifferences,
		);
	}

	private virtualFileNum = 1;
	public compileSource(source: string) {
		const sourceFile = this.project.createSourceFile(`file_${this.virtualFileNum++}.ts`, source);

		let exception: Error | undefined;
		let compiledSource = "";
		try {
			compiledSource = compileSourceFile(this.createCompilerState(true), sourceFile);
		} catch (e) {
			exception = e;
		}
		const errors = this.getDiagnosticErrors([sourceFile]);
		void sourceFile.deleteImmediately();

		if (errors.length > 0) {
			throw new DiagnosticError(errors);
		}

		if (exception) {
			throw exception;
		}

		return compiledSource;
	}

	private async getEmittedDtsFiles() {
		return new Promise<Array<string>>(resolve => {
			const result = new Array<string>();
			klaw(this.outPath)
				.on("data", item => {
					if (item.stats.isFile() && item.path.endsWith(".d.ts")) {
						result.push(item.path);
					}
				})
				.on("end", () => resolve(result));
		});
	}

	private async postProcessDtsFiles() {
		return Promise.all(
			(await this.getEmittedDtsFiles()).map(
				filePath =>
					new Promise(resolve => {
						void fs.readFile(filePath).then(contentsBuffer => {
							let fileContents = contentsBuffer.toString();
							fileContents = fileContents.replace(
								/<reference types="(?!@rbxts\/)([^."]+)" \/>/g,
								'<reference types="@rbxts/$1" />',
							);
							void fs.writeFile(filePath, fileContents).then(() => resolve());
						});
					}),
			),
		);
	}

	private getDiagnosticErrors(files: Array<ts.SourceFile>) {
		const errors = new Array<string>();
		for (const file of files) {
			const diagnostics = file
				.getPreEmitDiagnostics()
				.filter(diagnostic => diagnostic.getCategory() === ts.DiagnosticCategory.Error)
				.filter(diagnostic => !IGNORED_DIAGNOSTIC_CODES.has(diagnostic.getCode()));
			for (const diagnostic of diagnostics) {
				const diagnosticFile = diagnostic.getSourceFile();
				const line = diagnostic.getLineNumber();
				let prefix = "";
				if (diagnosticFile) {
					prefix += path.relative(this.projectPath, diagnosticFile.getFilePath());
					if (line) {
						prefix += ":" + line;
					}
					prefix += " - ";
				}

				let messageText = diagnostic.getMessageText();
				if (messageText instanceof ts.DiagnosticMessageChain) {
					// I went with the safest bet here, since getNext returns an array of ts.DiagnosticMessageChain,
					// and each element within those has a `.getNext()` method. That seems to me to imply
					// a very real possibility that some of those `.getNext()` calls would return duplicates of the
					// same thing. This will call all .getNext() methods, but will check to make sure we don't get
					// duplicates.
					const diagnosticMessages = [messageText];

					for (let i = 0; i < diagnosticMessages.length; i++) {
						const { [i]: message } = diagnosticMessages;
						const nextMessages = message.getNext();

						if (nextMessages) {
							for (const nextMessage of nextMessages) {
								if (!diagnosticMessages.includes(nextMessage)) {
									diagnosticMessages.push(nextMessage);
								}
							}
						}
					}

					messageText = diagnosticMessages.map(msg => msg.getMessageText()).join("\n");
				}
				errors.push(prefix + red("Diagnostic Error: ") + messageText);
			}
		}
		return errors;
	}

	public async compileFiles(files: Array<ts.SourceFile>) {
		await cleanDirRecursive(
			this.rootPath,
			this.outPath,
			async (src, dest, filePath) => !(await this.originalFileExists(src, dest, filePath)),
		);

		process.exitCode = 0;

		let success = false;

		const errors = this.getDiagnosticErrors(files);
		try {
			if (errors.length > 0) {
				process.exitCode = 1;
				throw new DiagnosticError(errors);
			}

			const sources = new Array<[string, string]>();
			for (const sourceFile of files) {
				if (!sourceFile.isDeclarationFile()) {
					const filePath = sourceFile.getFilePath();

					let baseName = path.basename(filePath, path.extname(filePath));
					baseName = path.basename(baseName, path.extname(baseName));
					if (baseName === "init") {
						warn("init.ts files are not supported!");
					}

					const outPath = transformPathToLua(this.rootPath, this.outPath, filePath);
					let source = compileSourceFile(this.createCompilerState(), sourceFile);

					if (this.luaSourceTransformer) {
						source = this.luaSourceTransformer(source);
					}

					sources.push([outPath, source]);
				}
			}

			for (const [filePath, contents] of sources) {
				if (await fs.pathExists(filePath)) {
					const oldContents = (await fs.readFile(filePath)).toString();
					if (oldContents === contents) {
						continue;
					}
				}
				await fs.ensureFile(filePath);
				await fs.writeFile(filePath, contents);
			}

			if (this.compilerOptions.declaration === true) {
				await this.project.emit({ emitOnlyDtsFiles: true });
				await this.postProcessDtsFiles();
			}

			success = true;
		} catch (e) {
			// do not silence errors for CI tests
			if (this.ci) {
				throw e;
			}
			if (e instanceof LoggableError) {
				e.log(this.projectPath);
			} else if (e instanceof DiagnosticError) {
				console.log(e.toString());
			} else {
				throw e;
			}
			process.exitCode = 1;
		}

		void addEvent("Compile", success ? "success" : "failure");
	}
}
