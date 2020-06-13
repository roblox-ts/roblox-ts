import ts from "byots";
import { renderAST } from "LuaRenderer";
import path from "path";
import { VirtualFileSystem } from "Project/classes/VirtualFileSystem";
import { getCustomPreEmitDiagnostics } from "Project/util/getCustomPreEmitDiagnostics";
import { validateCompilerOptions } from "Project/util/validateCompilerOptions";
import { ProjectType } from "Shared/constants";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { PathTranslator } from "Shared/PathTranslator";
import { RojoConfig } from "Shared/RojoConfig";
import { assert } from "Shared/util/assert";
import { GlobalSymbols, MacroManager, MultiTransformState, transformSourceFile, TransformState } from "TSTransformer";

// all virual paths use /
const join = path.posix.join;

const PROJECT_DIR = path.posix.sep;
const ROOT_DIR = join(PROJECT_DIR, "src");
const OUT_DIR = join(PROJECT_DIR, "out");
const PLAYGROUND_PATH = join(ROOT_DIR, "playground.tsx");

export class VirtualProject {
	public readonly vfs: VirtualFileSystem;

	private readonly compilerOptions: ts.CompilerOptions;
	private readonly rojoConfig: RojoConfig;
	private readonly pathTranslator: PathTranslator;
	private readonly nodeModulesPath: string;
	private readonly nodeModulesPathMapping: Map<string, string>;
	private readonly compilerHost: ts.CompilerHost;

	private program: ts.Program | undefined;

	constructor() {
		this.nodeModulesPath = join(PROJECT_DIR, "node_modules", "@rbxts");

		this.compilerOptions = {
			allowSyntheticDefaultImports: true,
			downlevelIteration: true,
			noLib: true,
			strict: true,
			target: ts.ScriptTarget.ESNext,
			moduleResolution: ts.ModuleResolutionKind.NodeJs,
			typeRoots: [this.nodeModulesPath],
			resolveJsonModule: true,
			rootDir: ROOT_DIR,
			outDir: OUT_DIR,
			jsx: ts.JsxEmit.React,
			jsxFactory: "Roact.createElement",
		};
		validateCompilerOptions(this.compilerOptions, this.nodeModulesPath);

		this.vfs = new VirtualFileSystem();

		this.compilerHost = ts.createCompilerHost(this.compilerOptions);
		this.compilerHost.readFile = filePath => this.vfs.readFile(filePath);
		this.compilerHost.fileExists = filePath => this.vfs.fileExists(filePath);
		this.compilerHost.directoryExists = dirPath => this.vfs.directoryExists(dirPath);

		this.rojoConfig = RojoConfig.synthetic(PROJECT_DIR);
		this.pathTranslator = new PathTranslator(ROOT_DIR, OUT_DIR, undefined);
		this.nodeModulesPathMapping = new Map<string, string>();
	}

	public compileSource(source: string) {
		this.vfs.writeFile(PLAYGROUND_PATH, source);

		this.program = ts.createProgram(this.vfs.getFilePaths(), this.compilerOptions, this.compilerHost, this.program);

		const typeChecker = this.program.getTypeChecker();

		const sourceFile = this.program.getSourceFile(PLAYGROUND_PATH);
		assert(sourceFile);

		const totalDiagnostics = new Array<ts.Diagnostic>();

		const customPreEmitDiagnostics = getCustomPreEmitDiagnostics(sourceFile);
		totalDiagnostics.push(...customPreEmitDiagnostics);
		if (totalDiagnostics.length > 0) throw new DiagnosticError(totalDiagnostics);

		const preEmitDiagnostics = ts.getPreEmitDiagnostics(this.program, sourceFile);
		totalDiagnostics.push(...preEmitDiagnostics);
		if (totalDiagnostics.length > 0) throw new DiagnosticError(totalDiagnostics);

		const transformState = new TransformState(
			this.compilerOptions,
			new MultiTransformState(),
			this.rojoConfig,
			this.pathTranslator,
			undefined,
			this.nodeModulesPath,
			undefined,
			this.nodeModulesPathMapping,
			typeChecker,
			new GlobalSymbols(typeChecker),
			new MacroManager(this.program, typeChecker, this.nodeModulesPath),
			undefined,
			ProjectType.Model,
			undefined,
			sourceFile,
		);

		const luaAST = transformSourceFile(transformState, sourceFile);
		totalDiagnostics.push(...transformState.diagnostics);
		if (totalDiagnostics.length > 0) throw new DiagnosticError(totalDiagnostics);

		const luaSource = renderAST(luaAST);
		return luaSource;
	}
}
