import Project, * as ts from "ts-simple-ast";
import { Transpiler, TranspilerError } from "./Transpiler";

import fs = require("fs-extra");
import path = require("path");

const INCLUDE_SRC_PATH = path.resolve(__dirname, "..", "..", "include");

export class Compiler {
	public project: Project;
	private includePath: string;

	constructor(configFilePath: string, includePath: string) {
		this.project = new Project({
			tsConfigFilePath: configFilePath,
		});
		this.project.addExistingSourceFiles("**/*.d.ts");
		this.includePath = path.resolve(includePath);
	}

	private transformPath(rootDir: string, outDir: string, filePath: string) {
		const relativeToRoot = path.dirname(path.relative(rootDir, filePath));
		let name = path.basename(filePath, path.extname(filePath));
		if (this.project.getCompilerOptions().module === ts.ModuleKind.CommonJS && name === "index") {
			name = "init";
		}
		const luaName = name + ".lua";
		return path.join(outDir, relativeToRoot, luaName);
	}

	public async compile() {
		const options = this.project.getCompilerOptions();

		const rootDir = options.rootDir;
		if (!rootDir) {
			throw new Error("Expected rootDir option in tsconfig.json!");
		}

		const outDir = options.outDir;
		if (!outDir) {
			throw new Error("Expected outDir option in tsconfig.json!");
		}

		try {
			this.project
				.getSourceFiles()
				.filter(sourceFile => !sourceFile.isDeclarationFile())
				.map(sourceFile => [
					this.transformPath(rootDir, outDir, sourceFile.getFilePath()),
					new Transpiler(rootDir, options).transpileSourceFile(sourceFile),
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

		fs.copy(INCLUDE_SRC_PATH, this.includePath);
	}
}
