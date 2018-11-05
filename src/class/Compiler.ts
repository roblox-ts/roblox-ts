import * as fs from "fs-extra";
import * as path from "path";
import Project, * as ts from "ts-simple-ast";
import * as util from "util";
import { getScriptContext, isValidLuaIdentifier, ScriptContext, stripExts } from "../utility";
import { CompilerError } from "./errors/CompilerError";
import { TranspilerError } from "./errors/TranspilerError";
import { Transpiler } from "./Transpiler";

const INCLUDE_SRC_PATH = path.resolve(__dirname, "..", "..", "include");
const SYNC_FILE_NAMES = ["rojo.json", "rofresh.json"];
const MODULE_PREFIX = "rbx-";

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

function red(s: string) {
	return `\x1b[31m${s}\x1b[0m`;
}

const LUA_EXT = ".lua";
async function copyLuaFiles(sourceFolder: string, destinationFolder: string) {
	const hasLuaFilesMap = new Map<string, boolean>();
	const searchForLuaFiles = async (dir: string) => {
		let hasLuaFiles = false;
		for (const fileName of await fs.readdir(dir)) {
			const filePath = path.join(dir, fileName);
			const stats = await fs.stat(filePath);
			if (stats.isFile() && path.extname(fileName) === LUA_EXT) {
				hasLuaFiles = true;
			} else if (stats.isDirectory()) {
				if (await searchForLuaFiles(filePath)) {
					hasLuaFiles = true;
				}
			}
		}
		hasLuaFilesMap.set(dir, hasLuaFiles);
		return hasLuaFiles;
	};
	await searchForLuaFiles(sourceFolder);

	await fs.copy(sourceFolder, destinationFolder, {
		filter: async (oldPath, newPath) => {
			const stats = await fs.stat(oldPath);
			if (stats.isDirectory() && hasLuaFilesMap.get(oldPath) === true) {
				return true;
			} else if (stats.isFile() && path.extname(oldPath) === LUA_EXT) {
				if (await fs.pathExists(newPath)) {
					const oldContents = await fs.readFile(oldPath);
					const newContents = await fs.readFile(newPath);
					return !oldContents.equals(newContents);
				} else {
					return true;
				}
			}
			return false;
		},
		recursive: true,
	});

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

const moduleCache = new Map<string, string>();

export class Compiler {
	private readonly project: Project;
	private readonly projectPath: string;
	private readonly includePath: string;
	private readonly modulesPath: string;
	private readonly baseUrl: string | undefined;
	private readonly rootDir: string;
	private readonly outDir: string;
	private readonly modulesDir?: ts.Directory;
	private readonly compilerOptions: ts.CompilerOptions;
	private readonly syncInfo = new Array<Partition>();

	public readonly strictMode: boolean;
	public readonly noHeader: boolean;
	public readonly noHueristics: boolean;

	constructor(configFilePath: string, args: { [argName: string]: any }) {
		this.projectPath = path.resolve(configFilePath, "..");
		this.project = new Project({
			tsConfigFilePath: configFilePath,
		});
		this.project.addExistingSourceFiles(path.join(this.projectPath, "**/*.d.ts"));
		this.includePath = path.resolve(this.projectPath, args.includePath);
		this.modulesPath = path.resolve(this.projectPath, args.modulesPath);
		this.strictMode = args.strict;
		this.noHeader = args.noHeader;
		this.noHueristics = args.noHueristics;
		this.compilerOptions = this.project.getCompilerOptions();

		this.baseUrl = this.compilerOptions.baseUrl;

		const rootDir = this.compilerOptions.rootDir;
		if (!rootDir) {
			throw new CompilerError("Expected 'rootDir' option in tsconfig.json!");
		}
		this.rootDir = rootDir;

		const outDir = this.compilerOptions.outDir;
		if (!outDir) {
			throw new CompilerError("Expected 'outDir' option in tsconfig.json!");
		}
		this.outDir = outDir;

		this.modulesDir = this.project.getDirectory(path.join(this.projectPath, "node_modules"));

		const syncFilePath = this.getSyncFilePath();
		if (syncFilePath) {
			const rojoJson = JSON.parse(fs.readFileSync(syncFilePath).toString()) as RojoJson;
			for (const key in rojoJson.partitions) {
				const part = rojoJson.partitions[key];
				const partPath = path.resolve(this.projectPath, part.path).replace(/\\/g, "/");
				if (partPath.startsWith(this.outDir)) {
					const directory = this.project.getDirectory(
						path.resolve(this.rootDir, path.relative(this.outDir, partPath)),
					);
					if (directory) {
						this.syncInfo.push({
							dir: directory,
							target: part.target,
						});
					} else {
						throw new CompilerError(`Could not find directory for partition: ${JSON.stringify(part)}`);
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
						throw new CompilerError(`Could not find directory for partition: ${JSON.stringify(part)}`);
					}
				}
			}
		}
	}

	private getSyncFilePath() {
		for (const name of SYNC_FILE_NAMES) {
			const filePath = path.resolve(this.projectPath, name);
			if (fs.existsSync(filePath)) {
				return filePath;
			}
		}
	}

	private transformPathToLua(rootDir: string, outDir: string, filePath: string) {
		const relativeToRoot = path.dirname(path.relative(rootDir, filePath));
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
		if (this.compilerOptions.module === ts.ModuleKind.CommonJS && name === "index") {
			name = "init";
		}
		const luaName = name + exts.join("") + ".lua";
		return path.join(outDir, relativeToRoot, luaName);
	}

	private transformPathToTS(rootDir: string, outDir: string, filePath: string) {
		const relativeToOut = path.dirname(path.relative(outDir, filePath));
		let name = path.basename(filePath, path.extname(filePath));
		if (this.compilerOptions.module === ts.ModuleKind.CommonJS && name === "init") {
			name = "index";
		}
		const luaName = name + ".ts";
		return path.join(rootDir, relativeToOut, luaName);
	}

	public addFile(filePath: string) {
		this.project.addExistingSourceFile(filePath);
	}

	public removeFile(filePath: string) {
		const sourceFile = this.project.getSourceFile(filePath);
		if (sourceFile) {
			this.project.removeSourceFile(sourceFile);
		}
	}

	public refresh(): Promise<Array<ts.FileSystemRefreshResult>> {
		return Promise.all(this.project.getSourceFiles().map(sourceFile => sourceFile.refreshFromFileSystem()));
	}

	public cleanDirRecursive(dir: string) {
		if (fs.existsSync(dir)) {
			const contents = fs.readdirSync(dir);
			for (const name of contents) {
				const filePath = path.join(dir, name);
				if (fs.statSync(filePath).isDirectory()) {
					this.cleanDirRecursive(filePath);
					if (fs.readdirSync(filePath).length === 0) {
						fs.rmdirSync(filePath);
					}
				} else {
					const ext = path.extname(filePath);
					if (ext === ".lua") {
						const tsPath = this.transformPathToTS(this.rootDir, this.outDir, filePath);
						const tsxPath = tsPath + "x";
						if (!this.project.getSourceFile(tsPath) && !this.project.getSourceFile(tsxPath)) {
							fs.removeSync(filePath);
						}
					}
				}
			}
		}
	}

	public getRootDirOrThrow() {
		if (!this.rootDir) {
			throw new CompilerError("Could not find rootDir!");
		}
		return this.rootDir;
	}

	public async copyModules() {
		if (this.modulesDir) {
			const nodeModulesPath = path.resolve(this.modulesDir.getPath());
			const modulesPath = this.modulesPath;
			for (const name of await fs.readdir(nodeModulesPath)) {
				if (name.startsWith(MODULE_PREFIX)) {
					const oldModulePath = path.join(nodeModulesPath, name);
					const newModulePath = path.join(modulesPath, name);
					await copyLuaFiles(oldModulePath, newModulePath);
				}
			}
		}
	}

	public async copyIncludes(noInclude: boolean) {
		if (!noInclude) {
			await copyLuaFiles(INCLUDE_SRC_PATH, this.includePath);
		}
	}

	public async compileAll(noInclude: boolean) {
		await this.compileFiles(this.project.getSourceFiles(), noInclude);
		await this.copyIncludes(noInclude);
		await this.copyModules();
	}

	public async compileFileByPath(filePath: string, noInclude: boolean) {
		const sourceFile = this.project.getSourceFile(filePath);
		if (!sourceFile) {
			throw new CompilerError(`No source file for Compiler.compileFileByPath() (filePath = ${filePath})`);
		}

		const seen = new Set<string>();
		const files = new Array<ts.SourceFile>();

		const search = (file: ts.SourceFile) => {
			files.push(file);
			file.getReferencingSourceFiles().forEach(ref => {
				const refPath = ref.getFilePath();
				if (!seen.has(refPath)) {
					seen.add(refPath);
					search(ref);
				}
			});
		};
		search(sourceFile);

		return this.compileFiles(files, noInclude);
	}

	public async compileFiles(files: Array<ts.SourceFile>, noInclude: boolean) {
		this.cleanDirRecursive(this.outDir);
		if (this.compilerOptions.declaration === true) {
			this.project.emit({ emitOnlyDtsFiles: true });
		}

		if (this.strictMode) {
			let errors = 0;

			files.forEach(file => {
				for (const diagnostic of file.getPreEmitDiagnostics()) {
					if (diagnostic.getCategory() === ts.DiagnosticCategory.Error) {
						const diagnosticFile = diagnostic.getSourceFile();
						const line = diagnostic.getLineNumber();
						if (diagnosticFile) {
							if (line) {
								console.log("%s:%d", diagnosticFile.getFilePath(), line);
							} else {
								console.log("%s", diagnosticFile.getFilePath());
							}
						}
						console.log(`${red("Diagnostic Error:")} ${diagnostic.getMessageText()}`);
						errors++;
					}
				}
			});
			if (errors > 0) {
				process.exitCode = 1;
				return;
			}
		}

		try {
			const sources = files.filter(sourceFile => !sourceFile.isDeclarationFile()).map(sourceFile => {
				const transpiler = new Transpiler(this);
				return [
					this.transformPathToLua(this.rootDir, this.outDir, sourceFile.getFilePath()),
					transpiler.transpileSourceFile(sourceFile, this.noHeader),
				];
			});

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
			if (e instanceof TranspilerError) {
				console.log(
					"%s:%d:%d",
					e.node.getSourceFile().getFilePath(),
					e.node.getStartLineNumber(),
					e.node.getNonWhitespaceStart() - e.node.getStartLinePos(),
				);
				console.log(`${red("Transpiler Error:")} ${e.message}`);
			} else if (e instanceof CompilerError) {
				console.log(`${red("Compiler Error:")} ${e.message}`);
			} else {
				throw e;
			}
			process.exitCode = 1;
		}
	}

	public getRobloxPathString(rbxPath: Array<string>) {
		rbxPath = rbxPath.map(v => (isValidLuaIdentifier(v) ? "." + v : `["${v}"]`));
		return "game" + rbxPath.join("");
	}

	public getRbxPath(sourceFile: ts.SourceFile) {
		const partition = this.syncInfo.find(part => part.dir.isAncestorOf(sourceFile));
		if (partition) {
			const rbxPath = partition.dir
				.getRelativePathTo(sourceFile)
				.split("/")
				.filter(part => part !== ".");

			let last = rbxPath.pop()!;
			let ext = path.extname(last);
			while (ext !== "") {
				last = path.basename(last, ext);
				ext = path.extname(last);
			}
			rbxPath.push(last);

			return rbxPath;
		}
	}

	public validateImport(sourceFile: ts.SourceFile, moduleFile: ts.SourceFile) {
		if (this.noHueristics) {
			return;
		}

		const sourceContext = getScriptContext(sourceFile);
		const sourceRbxPath = this.getRbxPath(sourceFile);
		const moduleRbxPath = this.getRbxPath(moduleFile);
		if (sourceRbxPath !== undefined && moduleRbxPath !== undefined) {
			if (sourceContext === ScriptContext.Client) {
				if (moduleRbxPath[0] === "ServerScriptService" || moduleRbxPath[0] === "ServerStorage") {
					throw new TranspilerError(
						util.format(
							"%s is not allowed to import %s",
							this.getRobloxPathString(sourceRbxPath),
							this.getRobloxPathString(moduleRbxPath),
						),
						sourceFile,
					);
				}
			}
		}
	}

	public getRelativeImportPath(sourceFile: ts.SourceFile, moduleFile: ts.SourceFile | undefined, specifier: string) {
		if (moduleFile) {
			this.validateImport(sourceFile, moduleFile);
		}

		const currentPartition = this.syncInfo.find(part => part.dir.isAncestorOf(sourceFile));
		const modulePartition = moduleFile && this.syncInfo.find(part => part.dir.isAncestorOf(moduleFile));

		if (moduleFile && currentPartition && currentPartition.target !== (modulePartition && modulePartition.target)) {
			return this.getImportPathFromFile(sourceFile, moduleFile);
		}

		const parts = path.posix
			.normalize(specifier)
			.split("/")
			.filter(part => part !== ".")
			.map(part => (part === ".." ? ".Parent" : part));
		if (this.compilerOptions.module === ts.ModuleKind.CommonJS && parts[parts.length - 1] === ".index") {
			parts.pop();
		}
		let prefix = "script";
		if (this.compilerOptions.module !== ts.ModuleKind.CommonJS || stripExts(sourceFile.getBaseName()) !== "index") {
			prefix += ".Parent";
		}

		const importRoot = prefix + parts.filter(p => p === ".Parent").join("");
		const importParts = parts.filter(p => p !== ".Parent");
		const params = importRoot + (importParts.length > 0 ? `, "${importParts.join(`", "`)}"` : "");

		return `TS.import(${params})`;
	}

	public getImportPathFromFile(sourceFile: ts.SourceFile, moduleFile: ts.SourceFile) {
		this.validateImport(sourceFile, moduleFile);
		if (this.modulesDir && this.modulesDir.isAncestorOf(moduleFile)) {
			let parts = this.modulesDir
				.getRelativePathTo(moduleFile)
				.split("/")
				.filter(part => part !== ".");

			const moduleName = parts.shift();
			if (!moduleName) {
				throw new CompilerError("Compiler.getImportPath() failed! #1");
			}

			let mainPath: string;
			if (moduleCache.has(moduleName)) {
				mainPath = moduleCache.get(moduleName)!;
			} else {
				const pkgJson = require(path.join(this.modulesDir.getPath(), moduleName, "package.json"));
				mainPath = pkgJson.main as string;
				moduleCache.set(moduleName, mainPath);
			}

			parts = mainPath.split(/[\\/]/g);
			let last = parts.pop();
			if (!last) {
				throw new CompilerError("Compiler.getImportPath() failed! #2");
			}
			last = stripExts(last);
			if (this.compilerOptions.module !== ts.ModuleKind.CommonJS || last !== "init") {
				parts.push(last);
			}

			parts = parts
				.filter(part => part !== ".")
				.map(part => (isValidLuaIdentifier(part) ? "." + part : `["${part}"]`));

			const params = `TS.getModule("${moduleName}", script.Parent)` + parts.join("");
			return `require(${params})`;
		} else {
			const partition = this.syncInfo.find(part => part.dir.isAncestorOf(moduleFile));
			if (!partition) {
				throw new CompilerError("Could not compile non-relative import, no data from rojo.json");
			}

			const parts = partition.dir
				.getRelativePathAsModuleSpecifierTo(moduleFile)
				.split("/")
				.filter(part => part !== ".");

			const last = parts.pop();
			if (!last) {
				throw new CompilerError("Compiler.getImportPath() failed! #3");
			}

			if (this.compilerOptions.module !== ts.ModuleKind.CommonJS || last !== "index") {
				parts.push(last);
			}

			const params = partition.target
				.split(".")
				.concat(parts)
				.filter(v => v.length > 0)
				.map(v => `"${v}"`)
				.join(", ");

			return `TS.import(${params})`;
		}
	}
}
