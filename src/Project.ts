import * as fs from "fs-extra";
import * as klaw from "klaw";
import { minify } from "luamin";
import * as path from "path";
import * as ts from "ts-morph";
import { compileSourceFile } from "./compiler";
import { CompilerState } from "./CompilerState";
import { CompilerError } from "./errors/CompilerError";
import { DiagnosticError } from "./errors/DiagnosticError";
import { ProjectError, ProjectErrorType } from "./errors/ProjectError";
import { red, yellow } from "./utility";

const MINIMUM_RBX_TYPES_VERSION = 188;

const LIB_PATH = path.resolve(__dirname, "..", "lib");
const SYNC_FILE_NAMES = ["rojo.json", "rofresh.json"];
const MODULE_PREFIX = "rbx-";

const IGNORED_DIAGNOSTIC_CODES = [
	2688, // "Cannot find type definition file for '{0}'."
	6054, // "File '{0}' has unsupported extension. The only supported extensions are {1}."
];

interface RojoJson {
	partitions: {
		[index: string]: {
			target: string;
			path: string;
		};
	};
}

interface Partition {
	dir: ts.Directory;
	target: string;
}

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
	const searchForDeadFiles = async (dir: string) => {
		if (await fs.pathExists(dir)) {
			for (const fileName of await fs.readdir(dir)) {
				const filePath = path.join(dir, fileName);
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
			}
		}
	};
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

export class Project {
	private readonly project: ts.Project;
	private readonly projectPath: string;
	private readonly includePath: string;
	private readonly noInclude: boolean;
	private readonly minify: boolean;
	private readonly modulesPath: string;
	private readonly baseUrl: string | undefined;
	private readonly rootDirPath: string;
	private readonly outDirPath: string;
	private readonly modulesDir?: ts.Directory;
	private readonly compilerOptions: ts.CompilerOptions;
	private readonly syncInfo = new Array<Partition>();
	private readonly ci: boolean;
	private readonly luaSourceTransformer: typeof minify | undefined;

	constructor(argv: { [argName: string]: any }) {
		let configFilePath = path.resolve(argv.project as string);

		try {
			fs.accessSync(configFilePath, fs.constants.R_OK | fs.constants.W_OK);
		} catch (e) {
			throw new Error("Project path does not exist!");
		}

		if (fs.statSync(configFilePath).isDirectory()) {
			configFilePath = path.resolve(configFilePath, "tsconfig.json");
		}

		if (!fs.existsSync(configFilePath) || !fs.statSync(configFilePath).isFile()) {
			throw new Error("Cannot find tsconfig.json!");
		}

		this.projectPath = path.resolve(configFilePath, "..");
		this.project = new ts.Project({
			tsConfigFilePath: configFilePath,
		});
		this.noInclude = argv.noInclude === true;
		this.includePath = path.resolve(this.projectPath, argv.includePath);
		this.minify = argv.minify;
		this.luaSourceTransformer = this.minify ? minify : undefined;
		this.modulesPath = path.resolve(this.projectPath, argv.modulesPath);
		this.ci = argv.ci;

		this.compilerOptions = this.project.getCompilerOptions();
		try {
			this.validateCompilerOptions();
			this.validateRbxTypes();
		} catch (e) {
			if (e instanceof ProjectError) {
				console.log(red("Compiler Error:"), e.message);
				process.exit(1);
			} else {
				throw e;
			}
		}

		this.baseUrl = this.compilerOptions.baseUrl;

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

		const syncFilePath = this.getSyncFilePath();
		if (syncFilePath) {
			const rojoJson = JSON.parse(fs.readFileSync(syncFilePath).toString()) as RojoJson;
			for (const key in rojoJson.partitions) {
				const part = rojoJson.partitions[key];
				const partPath = path.resolve(this.projectPath, part.path).replace(/\\/g, "/");
				if (partPath.startsWith(this.outDirPath)) {
					const directory = this.project.getDirectory(
						path.resolve(this.rootDirPath, path.relative(this.outDirPath, partPath)),
					);
					if (directory) {
						this.syncInfo.push({
							dir: directory,
							target: part.target,
						});
					} else {
						throw new ProjectError(
							`Could not find directory for partition: ${JSON.stringify(part)}`,
							ProjectErrorType.MissingPartitionDir,
						);
					}
				} else if (this.baseUrl && partPath.startsWith(this.baseUrl)) {
					const directory = this.project.getDirectory(
						path.resolve(this.baseUrl, path.relative(this.baseUrl, partPath)),
					);
					if (directory) {
						this.syncInfo.push({
							dir: directory,
							target: part.target,
						});
					} else {
						throw new ProjectError(
							`Could not find directory for partition: ${JSON.stringify(part)}`,
							ProjectErrorType.MissingPartitionDir,
						);
					}
				}
			}
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
		if (opts.types === undefined) {
			errors.push(`${yellow(`"types"`)} must be ${yellow(`[ "rbx-types" ]`)}`);
		} else if (opts.types.indexOf("rbx-types") === -1) {
			errors.push(`${yellow(`"types"`)} must include ${yellow(`"rbx-types"`)}`);
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
		const pkgLockJsonPath = path.join(this.projectPath, "package-lock.json");
		if (fs.pathExistsSync(pkgLockJsonPath)) {
			const pkgLock = JSON.parse(fs.readFileSync(pkgLockJsonPath).toString());
			if (pkgLock !== undefined) {
				const dependencies = pkgLock.dependencies;
				if (dependencies !== undefined) {
					const rbxTypes = dependencies["rbx-types"];
					if (rbxTypes !== undefined) {
						const rbxTypesVersion = rbxTypes.version;
						if (typeof rbxTypesVersion === "string") {
							const regexMatch = rbxTypesVersion.match(/\d+$/g);
							if (regexMatch !== null) {
								const patchNumber = Number(regexMatch[0]);
								if (!isNaN(patchNumber)) {
									if (patchNumber >= MINIMUM_RBX_TYPES_VERSION) {
										return;
									} else {
										throw new ProjectError(
											`rbx-types is out of date!\n` +
												yellow(`Installed version: 1.0.${patchNumber}\n`) +
												yellow(`Minimum required version: 1.0.${MINIMUM_RBX_TYPES_VERSION}\n`) +
												`Run 'npm i rbx-types' to fix this.`,
											ProjectErrorType.BadRbxTypes,
										);
									}
								}
							}
						}
					}
				}
			}
		}
		throw new ProjectError(
			`Could not find rbx-types in package-lock.json!\n` + `Run 'npm i rbx-types' to fix this.`,
			ProjectErrorType.BadRbxTypes,
		);
	}

	private getSyncFilePath() {
		for (const name of SYNC_FILE_NAMES) {
			const filePath = path.resolve(this.projectPath, name);
			if (fs.existsSync(filePath)) {
				return filePath;
			}
		}
	}

	private transformPathToLua(filePath: string) {
		const relativeToRoot = path.dirname(path.relative(this.rootDirPath, filePath));
		let name = path.basename(filePath, path.extname(filePath));
		const exts = new Array<string>();
		while (true) {
			const ext = path.extname(name);
			if (ext.length > 0) {
				exts.unshift(ext);
				name = path.basename(name, ext);
			} else {
				break;
			}
		}
		if (exts[exts.length - 1] === ".d") {
			exts.pop();
		}
		if (name === "index") {
			name = "init";
		}
		const luaName = name + exts.join("") + ".lua";
		return path.join(this.outDirPath, relativeToRoot, luaName);
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

	public refresh(): Promise<Array<ts.FileSystemRefreshResult>> {
		return Promise.all(this.project.getSourceFiles().map(sourceFile => sourceFile.refreshFromFileSystem()));
	}

	public async cleanDirRecursive(dir: string) {
		if (fs.existsSync(dir)) {
			const contents = fs.readdirSync(dir);
			for (const name of contents) {
				const filePath = path.join(dir, name);
				if (fs.statSync(filePath).isDirectory()) {
					await this.cleanDirRecursive(filePath);
					if (fs.readdirSync(filePath).length === 0) {
						fs.rmdirSync(filePath);
					}
				} else {
					const ext = path.extname(filePath);
					if (ext === ".lua") {
						const relativeToOut = path.dirname(path.relative(this.outDirPath, filePath));
						const rootPath = path.join(this.rootDirPath, relativeToOut);

						let baseName = path.basename(filePath, path.extname(filePath)); // index.server
						const subext = path.extname(baseName);
						baseName = path.basename(baseName, subext);

						const tsFile = await fs.pathExists(path.join(rootPath, baseName) + subext + ".ts");
						const tsxFile = await fs.pathExists(path.join(rootPath, baseName) + subext + ".tsx");
						const initLuaFile =
							baseName === "init" && (await fs.pathExists(path.join(rootPath, "init") + subext + ".lua"));
						const indexTsFile =
							baseName === "init" && (await fs.pathExists(path.join(rootPath, "index") + subext + ".ts"));
						const indexTsxFile =
							baseName === "init" &&
							(await fs.pathExists(path.join(rootPath, "index") + subext + ".tsx"));
						const luaFile = await fs.pathExists(path.join(rootPath, baseName) + subext + ".lua");

						if (!tsFile && !tsxFile && !initLuaFile && !indexTsFile && !indexTsxFile && !luaFile) {
							fs.removeSync(filePath);
							console.log("remove", filePath);
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
		if (this.modulesDir) {
			const nodeModulesPath = path.resolve(this.modulesDir.getPath());
			const modulesPath = this.modulesPath;
			for (const name of await fs.readdir(nodeModulesPath)) {
				if (name.startsWith(MODULE_PREFIX)) {
					const oldModulePath = path.join(nodeModulesPath, name);
					const newModulePath = path.join(modulesPath, name);
					await copyAndCleanDeadLuaFiles(oldModulePath, newModulePath, this.luaSourceTransformer);
				}
			}
		}
	}

	public async copyIncludeFiles() {
		if (!this.noInclude) {
			await copyAndCleanDeadLuaFiles(LIB_PATH, this.includePath);
		}
	}

	public async copyLuaSourceFiles() {
		await copyLuaFiles(this.rootDirPath, this.outDirPath, this.luaSourceTransformer);
	}

	public async compileAll() {
		await this.copyLuaSourceFiles();
		await this.compileFiles(this.project.getSourceFiles());
		await this.copyIncludeFiles();
		await this.copyModuleFiles();
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
			await this.copyLuaSourceFiles();
		}
	}

	public async compileFiles(files: Array<ts.SourceFile>) {
		await this.cleanDirRecursive(this.outDirPath);
		if (this.compilerOptions.declaration === true) {
			this.project.emit({ emitOnlyDtsFiles: true });
		}

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
					const outPath = this.transformPathToLua(filePath);
					let source = compileSourceFile(new CompilerState(this.syncInfo, this.modulesDir), sourceFile);

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
		} catch (e) {
			// do not silence errors for CI tests
			if (this.ci) {
				throw e;
			}
			if (e instanceof CompilerError) {
				console.log(
					"%s:%d:%d - %s %s",
					path.relative(this.projectPath, e.node.getSourceFile().getFilePath()),
					e.node.getStartLineNumber(),
					e.node.getNonWhitespaceStart() - e.node.getStartLinePos(),
					red("Compiler Error:"),
					e.message,
				);
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
