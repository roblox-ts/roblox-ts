import fs from "fs-extra";
import klaw from "klaw";
import { minify } from "luamin";
import path from "path";
import RojoProject, { RojoProjectError } from "rojo-utils";
import * as ts from "ts-morph";
import { compileSourceFile } from "./compiler";
import { CompilerState } from "./CompilerState";
import { CompilerError } from "./errors/CompilerError";
import { DiagnosticError } from "./errors/DiagnosticError";
import { ProjectError, ProjectErrorType } from "./errors/ProjectError";
import { ProjectInfo } from "./types";
import { red, transformPathToLua, yellow } from "./utility";

const MINIMUM_RBX_TYPES_VERSION = 203;

const LIB_PATH = path.resolve(__dirname, "..", "lib");
const ROJO_FILE_REGEX = /^.+\.project\.json$/;
const ROJO_DEFAULT_NAME = "default.project.json";
const ROJO_OLD_NAME = "roblox-project.json";

const IGNORED_DIAGNOSTIC_CODES = [
	2688, // "Cannot find type definition file for '{0}'."
	6054, // "File '{0}' has unsupported extension. The only supported extensions are {1}."
];

const LUA_EXT = ".lua";
function getLuaFiles(sourceFolder: string): Promise<Array<string>> {
	return new Promise((resolve, reject) => {
		const result = new Array<string>();
		klaw(sourceFolder)
			.on("data", item => {
				if (item.stats.isFile() && path.extname(item.path) === LUA_EXT) {
					result.push(item.path);
				}
			})
			.on("end", () => resolve(result))
			.on("error", reject);
	});
}

function joinIfNotAbsolute(basePath: string, relativePath: string) {
	if (path.isAbsolute(relativePath)) {
		return relativePath;
	} else {
		return path.join(basePath, relativePath);
	}
}

async function copyLuaFiles(sourceFolder: string, destinationFolder: string, transform?: (input: string) => string) {
	(await getLuaFiles(sourceFolder)).forEach(async oldPath => {
		const newPath = path.join(destinationFolder, path.relative(sourceFolder, oldPath));

		let source = await fs.readFile(oldPath, "utf8");

		if (transform) {
			source = transform(source);
		}

		if (!(await fs.pathExists(newPath)) || (await fs.readFile(newPath, "utf8")) !== source) {
			await fs.ensureFile(newPath);
			await fs.writeFile(newPath, source);
		}
	});
}

async function cleanDeadLuaFiles(sourceFolder: string, destinationFolder: string) {
	async function searchForDeadFiles(dir: string) {
		if (await fs.pathExists(dir)) {
			for (const fileName of await fs.readdir(dir)) {
				const filePath = path.join(dir, fileName);
				try {
					const stats = await fs.stat(filePath);
					if (stats.isDirectory()) {
						searchForDeadFiles(filePath);
						if ((await fs.readdir(dir)).length === 0) {
							fs.remove(filePath);
							console.log("delete", "dir", filePath);
						}
					} else if (stats.isFile()) {
						const relativeToDestFolder = path.relative(destinationFolder, filePath);
						if (!(await fs.existsSync(path.join(sourceFolder, relativeToDestFolder)))) {
							fs.remove(filePath);
							console.log("delete", "file", filePath);
						}
					}
				} catch (e) {
					console.log("failed to clean", filePath);
				}
			}
		}
	}
	await searchForDeadFiles(destinationFolder);
}

async function copyAndCleanDeadLuaFiles(
	sourceFolder: string,
	destinationFolder: string,
	transform?: (input: string) => string,
) {
	await copyLuaFiles(sourceFolder, destinationFolder, transform);
	await cleanDeadLuaFiles(sourceFolder, destinationFolder);
}

export enum ProjectType {
	Game,
	Bundle,
	Package,
}

interface ProjectOptions {
	project?: string;
	includePath?: string;
	rojo?: string;
	noInclude?: boolean;
	minify?: boolean;
	ci?: boolean;
}

export class Project {
	public configFilePath: string;
	public rojoFilePath: string | undefined;

	private project: ts.Project = {} as ts.Project;
	private compilerOptions: ts.CompilerOptions = {};
	private projectPath: string = "";

	private rojoProject?: RojoProject;
	private projectInfo: ProjectInfo = { type: ProjectType.Package };

	private readonly includePath: string;
	private readonly noInclude: boolean;
	private readonly minify: boolean;
	private readonly modulesPath: string;
	private readonly rootDirPath: string;
	private readonly outDirPath: string;
	private readonly modulesDir?: ts.Directory;
	private readonly rojoOverridePath: string | undefined;
	private readonly runtimeOverride: string | undefined;
	private readonly ci: boolean;
	private readonly luaSourceTransformer: typeof minify | undefined;

	public reloadProject() {
		try {
			fs.accessSync(this.configFilePath, fs.constants.R_OK | fs.constants.W_OK);
		} catch (e) {
			throw new Error("Project path does not exist!");
		}

		if (fs.statSync(this.configFilePath).isDirectory()) {
			this.configFilePath = path.resolve(this.configFilePath, "tsconfig.json");
		}

		if (!fs.existsSync(this.configFilePath) || !fs.statSync(this.configFilePath).isFile()) {
			throw new Error("Cannot find tsconfig.json!");
		}

		this.projectPath = path.resolve(this.configFilePath, "..");

		this.project = new ts.Project({
			compilerOptions: {
				configFilePath: this.configFilePath,
			},
			tsConfigFilePath: this.configFilePath,
		});

		this.compilerOptions = this.project.getCompilerOptions();
		try {
			this.validateCompilerOptions();
		} catch (e) {
			if (e instanceof ProjectError) {
				console.log(red("Compiler Error:"), e.message);
				process.exit(1);
			} else {
				throw e;
			}
		}
	}

	public reloadRojo() {
		if (this.rojoFilePath) {
			try {
				this.rojoProject = RojoProject.fromPathSync(this.rojoFilePath);
			} catch (e) {
				if (e instanceof RojoProjectError) {
					console.log(
						"Warning!",
						"Failed to load Rojo configuration. Import and export statements will not compile.",
						e.message,
					);
				}
			}
		}

		if (this.rojoProject) {
			const runtimeLibPath = this.rojoProject.getRbxFromFile(path.join(this.includePath, "RuntimeLib.lua")).path;
			if (!runtimeLibPath) {
				throw new ProjectError(
					`A Rojo project file was found ( ${this
						.rojoFilePath!} ), but contained no data for the include folder!`,
					ProjectErrorType.BadRojoInclude,
				);
			}
			let type: ProjectType.Game | ProjectType.Bundle;
			if (this.rojoProject.isGame()) {
				type = ProjectType.Game;
			} else {
				type = ProjectType.Bundle;
			}
			this.projectInfo = {
				runtimeLibPath,
				type,
			};
		} else {
			this.projectInfo = { type: ProjectType.Package };
		}
	}

	constructor(opts: ProjectOptions = {}) {
		// cli mode
		if (opts.project !== undefined && opts.includePath !== undefined && opts.rojo !== undefined) {
			this.configFilePath = path.resolve(opts.project);
			this.reloadProject();

			this.noInclude = opts.noInclude === true;
			this.includePath = joinIfNotAbsolute(this.projectPath, opts.includePath);
			this.minify = opts.minify === true;
			this.luaSourceTransformer = this.minify ? minify : undefined;
			this.modulesPath = path.join(this.includePath, "node_modules");
			this.rojoOverridePath = opts.rojo !== "" ? joinIfNotAbsolute(this.projectPath, opts.rojo) : undefined;

			this.ci = opts.ci === true;

			try {
				this.validateRbxTypes();
			} catch (e) {
				if (e instanceof ProjectError) {
					console.log(red("Compiler Error:"), e.message);
					process.exit(1);
				} else {
					throw e;
				}
			}

			const rootDirPath = this.compilerOptions.rootDir;
			if (!rootDirPath) {
				throw new ProjectError("Expected 'rootDir' option in tsconfig.json!", ProjectErrorType.MissingRootDir);
			}
			this.rootDirPath = rootDirPath;

			const outDirPath = this.compilerOptions.outDir;
			if (!outDirPath) {
				throw new ProjectError("Expected 'outDir' option in tsconfig.json!", ProjectErrorType.MissingOutDir);
			}
			this.outDirPath = outDirPath;

			// filter out outDir .d.ts files
			const outDir = this.project.getDirectory(outDirPath);
			if (outDir) {
				this.project.getSourceFiles().forEach(sourceFile => {
					if (outDir.isAncestorOf(sourceFile)) {
						this.project.removeSourceFile(sourceFile);
					}
				});
			}

			this.modulesDir = this.project.getDirectory(path.join(this.projectPath, "node_modules"));

			this.rojoFilePath = this.getRojoFilePath();
			this.reloadRojo();
		} else {
			this.configFilePath = "";
			this.includePath = "";
			this.noInclude = true;
			this.minify = false;
			this.modulesPath = "";
			this.rootDirPath = "";
			this.outDirPath = "";
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
					rootDir: "src",
					strict: true,
					target: ts.ts.ScriptTarget.ES2015,
					typeRoots: ["node_modules/@rbxts"],
				},
			});
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

		const rbxTsModulesPath = path.join(this.projectPath, "node_modules", "@rbxts");
		if (
			opts.typeRoots === undefined ||
			opts.typeRoots.find(v => path.normalize(v) === rbxTsModulesPath) === undefined
		) {
			errors.push(`${yellow(`"typeRoots"`)} must be ${yellow(`[ "node_modules/@rbxts" ]`)}`);
		}

		if (opts.types !== undefined) {
			errors.push(`${yellow(`"types"`)} must be ${yellow(`undefined`)}`);
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
		const pkgJsonPath = path.join(this.projectPath, "node_modules", "@rbxts", "types", "package.json");
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
				console.log(yellow(`Warning! Multiple *.project.json files found, using ${candidates[0]}`));
			}
			return candidates[0];
		}
	}

	public addFile(filePath: string) {
		this.project.addExistingSourceFile(filePath);
	}

	public async removeFile(filePath: string) {
		const sourceFile = this.project.getSourceFile(filePath);
		if (sourceFile) {
			this.project.removeSourceFile(sourceFile);
		}
		await this.cleanDirRecursive(this.outDirPath);
	}

	public async refreshFile(filePath: string) {
		const file = this.project.getSourceFile(filePath);
		if (file) {
			file.refreshFromFileSystem();
		} else {
			this.project.addExistingSourceFile(filePath);
		}
	}

	public async cleanDirRecursive(dir: string) {
		if (await fs.pathExists(dir)) {
			for (const name of await fs.readdir(dir)) {
				const filePath = path.join(dir, name);
				if ((await fs.stat(filePath)).isDirectory()) {
					await this.cleanDirRecursive(filePath);
					if ((await fs.readdir(filePath)).length === 0) {
						await fs.rmdir(filePath);
					}
				} else {
					let ext = path.extname(filePath);
					let baseName = path.basename(filePath, ext);
					let subext = path.extname(baseName);
					baseName = path.basename(baseName, subext);
					const relativeToOut = path.dirname(path.relative(this.outDirPath, filePath));
					const rootPath = path.join(this.rootDirPath, relativeToOut);
					if (ext === ".lua") {
						let exists = false;
						exists = exists || (await fs.pathExists(path.join(rootPath, baseName) + subext + ".ts"));
						exists = exists || (await fs.pathExists(path.join(rootPath, baseName) + subext + ".tsx"));
						exists =
							exists ||
							(baseName === "init" &&
								(await fs.pathExists(path.join(rootPath, "init") + subext + ".lua")));
						exists =
							exists ||
							(baseName === "init" &&
								(await fs.pathExists(path.join(rootPath, "index") + subext + ".ts")));
						exists =
							exists ||
							(baseName === "init" &&
								(await fs.pathExists(path.join(rootPath, "index") + subext + ".tsx")));
						exists = exists || (await fs.pathExists(path.join(rootPath, baseName) + subext + ".lua"));

						if (!exists) {
							await fs.remove(filePath);
							console.log("remove", filePath);
						}
					} else if (subext === ".d" && ext === ".ts") {
						if (!this.compilerOptions.declaration) {
							await fs.remove(filePath);
							console.log("remove", filePath);
						} else {
							ext = subext + ext;
							baseName = path.basename(filePath, ext);
							subext = path.extname(baseName);
							baseName = path.basename(baseName, subext);

							let exists = false;
							exists = exists || (await fs.pathExists(path.join(rootPath, baseName) + subext + ".d.ts"));
							exists = exists || (await fs.pathExists(path.join(rootPath, baseName) + subext + ".ts"));
							exists = exists || (await fs.pathExists(path.join(rootPath, baseName) + subext + ".tsx"));

							if (!exists) {
								await fs.remove(filePath);
								console.log("remove", filePath);
							}
						}
					}
				}
			}
		}
	}

	public getRootDirOrThrow() {
		if (!this.rootDirPath) {
			throw new ProjectError("Could not find rootDir!", ProjectErrorType.MissingRootDir);
		}
		return this.rootDirPath;
	}

	public async copyModuleFiles() {
		if (this.modulesDir && this.projectInfo.type !== ProjectType.Package) {
			const modulesPath = this.modulesPath;
			const rbxTsModulesPath = path.resolve(this.modulesDir.getPath(), "@rbxts");
			if (await fs.pathExists(rbxTsModulesPath)) {
				for (const name of await fs.readdir(rbxTsModulesPath)) {
					const oldModulePath = path.join(rbxTsModulesPath, name);
					const newModulePath = path.join(modulesPath, name);
					await copyAndCleanDeadLuaFiles(oldModulePath, newModulePath, this.luaSourceTransformer);
				}
			}
		}
	}

	public async copyIncludeFiles() {
		if (!this.noInclude && this.projectInfo.type !== ProjectType.Package) {
			await copyLuaFiles(LIB_PATH, this.includePath, this.luaSourceTransformer);
		}
	}

	public async copyLuaFiles() {
		await copyLuaFiles(this.rootDirPath, this.outDirPath, this.luaSourceTransformer);
	}

	public async copyDtsFiles() {
		const dtsFiles = new Array<string>();
		await new Promise(resolve => {
			klaw(this.rootDirPath)
				.on("data", item => {
					if (item.path.endsWith(".d.ts")) {
						dtsFiles.push(item.path);
					}
				})
				.on("end", () => resolve());
		});
		return Promise.all(
			dtsFiles.map(filePath => {
				return new Promise(resolve => {
					const outPath = path.join(this.outDirPath, path.relative(this.rootDirPath, filePath));
					fs.readFile(filePath).then(buffer => {
						const contents = buffer.toString();
						fs.ensureFile(outPath).then(() => {
							fs.writeFile(outPath, contents).then(() => resolve());
						});
					});
				});
			}),
		);
	}

	public async compileAll() {
		await this.compileFiles(this.project.getSourceFiles());
		if (process.exitCode === 0) {
			await this.copyLuaFiles();
			if (this.compilerOptions.declaration) {
				await this.copyDtsFiles();
			}
			await this.copyIncludeFiles();
			await this.copyModuleFiles();
		}
	}

	public async compileFileByPath(filePath: string) {
		const ext = path.extname(filePath);
		if (ext === ".ts" || ext === ".tsx") {
			const sourceFile = this.project.getSourceFile(filePath);
			if (!sourceFile) {
				throw new ProjectError(
					`No source file for Compiler.compileFileByPath() (filePath = ${filePath})`,
					ProjectErrorType.MissingSourceFile,
				);
			}
			return this.compileFiles([sourceFile]);
		} else if (ext === ".lua") {
			await this.copyLuaFiles();
		}
	}

	public async compileSource(source: string) {
		const existing = this.project.getSourceFile("playground.ts");
		if (existing) {
			this.project.removeSourceFile(existing);
		}
		const sourceFile = this.project.createSourceFile("playground.ts", source);
		return compileSourceFile(
			new CompilerState(
				this.rootDirPath,
				this.outDirPath,
				this.projectInfo,
				this.rojoProject,
				this.modulesDir,
				this.runtimeOverride,
			),
			sourceFile,
		);
	}

	private async getEmittedDtsFiles() {
		return new Promise<Array<string>>(resolve => {
			const result = new Array<string>();
			klaw(this.outDirPath)
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
						fs.readFile(filePath).then(contentsBuffer => {
							let fileContents = contentsBuffer.toString();
							fileContents = fileContents.replace(
								/<reference types="([^."]+)" \/>/g,
								'<reference types="@rbxts/$1" />',
							);
							fs.writeFile(filePath, fileContents).then(() => resolve());
						});
					}),
			),
		);
	}

	public async compileFiles(files: Array<ts.SourceFile>) {
		await this.cleanDirRecursive(this.outDirPath);

		const errors = new Array<string>();
		for (const file of files) {
			const diagnostics = file
				.getPreEmitDiagnostics()
				.filter(diagnostic => diagnostic.getCategory() === ts.DiagnosticCategory.Error)
				.filter(diagnostic => IGNORED_DIAGNOSTIC_CODES.indexOf(diagnostic.getCode()) === -1);
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
					const textSegments = new Array<string>();
					let chain: ts.DiagnosticMessageChain | undefined = messageText;
					while (chain !== undefined) {
						textSegments.push(chain.getMessageText());
						chain = chain.getNext();
					}
					messageText = textSegments.join("\n");
				}
				const str = prefix + red("Diagnostic Error: ") + messageText;
				if (!this.ci) {
					console.log(str);
				}
				errors.push(str);
			}
		}

		process.exitCode = 0;

		try {
			if (errors.length > 0) {
				process.exitCode = 1;
				throw new DiagnosticError(errors);
			}

			const sources = new Array<[string, string]>();
			for (const sourceFile of files) {
				if (!sourceFile.isDeclarationFile()) {
					const filePath = sourceFile.getFilePath();
					const outPath = transformPathToLua(this.rootDirPath, this.outDirPath, filePath);
					let source = compileSourceFile(
						new CompilerState(
							this.rootDirPath,
							this.outDirPath,
							this.projectInfo,
							this.rojoProject,
							this.modulesDir,
							this.runtimeOverride,
						),
						sourceFile,
					);

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
		} catch (e) {
			// do not silence errors for CI tests
			if (this.ci) {
				throw e;
			}
			if (e instanceof CompilerError) {
				const node = e.node;
				if (ts.TypeGuards.isSourceFile(node)) {
					console.log(
						"%s - %s %s",
						path.relative(this.projectPath, e.node.getSourceFile().getFilePath()),
						red("Compiler Error:"),
						e.message,
					);
				} else {
					console.log(
						"%s:%d:%d - %s %s",
						path.relative(this.projectPath, e.node.getSourceFile().getFilePath()),
						e.node.getStartLineNumber(),
						e.node.getNonWhitespaceStart() - e.node.getStartLinePos(),
						red("Compiler Error:"),
						e.message,
					);
				}
			} else if (e instanceof ProjectError) {
				console.log(red("Project Error:"), e.message);
			} else if (e instanceof DiagnosticError) {
				// log above
			} else {
				throw e;
			}
			process.exitCode = 1;
		}
	}
}
