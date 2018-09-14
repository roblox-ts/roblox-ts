import Project, * as ts from "ts-simple-ast";
import { Transpiler, TranspilerError } from "./Transpiler";

import * as fs from "fs-extra";
import * as path from "path";

const INCLUDE_SRC_PATH = path.resolve(__dirname, "..", "..", "include");

export class Compiler {
	private project: Project;
	private includePath: string;
	public readonly rootDir: string;
	public readonly outDir: string;

	constructor(configFilePath: string, includePath: string) {
		this.project = new Project({
			tsConfigFilePath: configFilePath,
		});
		this.project.addExistingSourceFiles("**/*.d.ts");
		this.includePath = path.resolve(includePath);

		const options = this.project.getCompilerOptions();

		const rootDir = options.rootDir;
		if (!rootDir) {
			throw new Error("Expected rootDir option in tsconfig.json!");
		}
		this.rootDir = rootDir;

		const outDir = options.outDir;
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

	public refreshSync() {
		this.project.getSourceFiles().forEach(sourceFile => sourceFile.refreshFromFileSystemSync());
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
					if (!this.project.getSourceFile(tsPath)) {
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
			const result = this.project.emit({ emitOnlyDtsFiles: true });
		} else {
		}

		try {
			this.project
				.getSourceFiles()
				.filter(sourceFile => !sourceFile.isDeclarationFile())
				.map(sourceFile => [
					this.transformPathToLua(this.rootDir, this.outDir, sourceFile.getFilePath()),
					new Transpiler(this.rootDir, options).transpileSourceFile(sourceFile),
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
