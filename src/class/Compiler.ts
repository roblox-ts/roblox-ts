import Project, * as ts from "ts-simple-ast";
import { Transpiler, TranspilerError } from "./Transpiler";

import * as fs from "fs-extra";
import * as path from "path";

const INCLUDE_SRC_PATH = path.resolve(__dirname, "..", "..", "include");

export class Compiler {
	public readonly project: Project;
	public readonly includePath: string;
	public readonly rootDir: string;
	public readonly outDir: string;
	public readonly options: ts.CompilerOptions;
	public readonly moduleDir: ts.Directory | undefined;

	constructor(configFilePath: string, includePath: string) {
		this.project = new Project({
			tsConfigFilePath: configFilePath,
		});
		this.project.addExistingSourceFiles("**/*.d.ts");
		this.includePath = path.resolve(includePath);
		this.moduleDir = this.project.getDirectory("node_modules");
		this.options = this.project.getCompilerOptions();

		const rootDir = this.options.rootDir;
		if (!rootDir) {
			throw new Error("Expected rootDir option in tsconfig.json!");
		}
		this.rootDir = rootDir;

		const outDir = this.options.outDir;
		if (!outDir) {
			throw new Error("Expected outDir option in tsconfig.json!");
		}
		this.outDir = outDir;
	}

	private transformPathToLua(rootDir: string, outDir: string, filePath: string) {
		const relativeToRoot = path.dirname(path.relative(rootDir, filePath));
		let name = path.basename(filePath, path.extname(filePath));
		if (this.project.getCompilerOptions().module === ts.ModuleKind.CommonJS && name === "index") {
			name = "init";
		}
		const luaName = name + ".lua";
		return path.join(outDir, relativeToRoot, luaName);
	}

	private transformPathToTS(rootDir: string, outDir: string, filePath: string) {
		const relativeToOut = path.dirname(path.relative(outDir, filePath));
		let name = path.basename(filePath, path.extname(filePath));
		if (this.project.getCompilerOptions().module === ts.ModuleKind.CommonJS && name === "init") {
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
					const tsPath = this.transformPathToTS(this.rootDir, this.outDir, filePath);
					const tsxPath = tsPath + "x";
					if (!this.project.getSourceFile(tsPath) && !this.project.getSourceFile(tsxPath)) {
						fs.removeSync(filePath);
					}
				}
			}
		}
	}

	public async compile(noInclude: boolean) {
		const options = this.project.getCompilerOptions();
		this.cleanDirRecursive(this.outDir);

		if (options.declaration) {
			this.project.emit({ emitOnlyDtsFiles: true });
		}

		try {
			this.project
				.getSourceFiles()
				.filter(sourceFile => !sourceFile.isDeclarationFile())
				.map(sourceFile => [
					this.transformPathToLua(this.rootDir, this.outDir, sourceFile.getFilePath()),
					new Transpiler(this).transpileSourceFile(sourceFile),
				])
				.forEach(([filePath, contents]) => ts.ts.sys.writeFile(filePath, contents));
		} catch (e) {
			if (e instanceof TranspilerError) {
				console.log(e.node.getSourceFile().getFilePath());
				console.log(e.stack);
			} else {
				throw e;
			}
			process.exit(1);
		}

		if (!noInclude) {
			try {
				await fs.copy(INCLUDE_SRC_PATH, this.includePath);
			} catch (e) {
				// this rarely fails, unsure why
			}
		}
	}
}
