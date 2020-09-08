import ts from "byots";
import { renderAST } from "LuauRenderer";
import { pathJoin, PATH_SEP, VirtualFileSystem } from "Project/classes/VirtualFileSystem";
import { getCustomPreEmitDiagnostics } from "Project/util/getCustomPreEmitDiagnostics";
import { validateCompilerOptions } from "Project/util/validateCompilerOptions";
import { PathTranslator } from "Shared/classes/PathTranslator";
import { RojoResolver } from "Shared/classes/RojoResolver";
import { NODE_MODULES, ProjectType, RBXTS_SCOPE } from "Shared/constants";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { assert } from "Shared/util/assert";
import {
	GlobalSymbols,
	MacroManager,
	MultiTransformState,
	RoactSymbolManager,
	transformSourceFile,
	TransformState,
} from "TSTransformer";

const PROJECT_DIR = PATH_SEP;
const ROOT_DIR = pathJoin(PROJECT_DIR, "src");
const OUT_DIR = pathJoin(PROJECT_DIR, "out");
const PLAYGROUND_PATH = pathJoin(ROOT_DIR, "playground.tsx");

export class VirtualProject {
	public readonly vfs: VirtualFileSystem;

	private readonly compilerOptions: ts.CompilerOptions;
	private readonly rojoResolver: RojoResolver;
	private readonly pathTranslator: PathTranslator;
	private readonly nodeModulesPath: string;
	private readonly nodeModulesPathMapping: Map<string, string>;
	private readonly compilerHost: ts.CompilerHost;

	private program: ts.Program | undefined;

	constructor() {
		this.nodeModulesPath = pathJoin(PROJECT_DIR, NODE_MODULES, RBXTS_SCOPE);

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

		const system = {
			getExecutingFilePath: () => __filename,
			getCurrentDirectory: () => "/",
		} as ts.System;

		this.compilerHost = ts.createCompilerHostWorker(this.compilerOptions, undefined, system);
		this.compilerHost.readFile = filePath => this.vfs.readFile(filePath);
		this.compilerHost.fileExists = filePath => this.vfs.fileExists(filePath);
		this.compilerHost.directoryExists = dirPath => this.vfs.directoryExists(dirPath);
		this.compilerHost.getDirectories = dirPath => this.vfs.getDirectories(dirPath);
		this.compilerHost.useCaseSensitiveFileNames = () => true;
		this.compilerHost.getCurrentDirectory = () => PATH_SEP;

		this.rojoResolver = RojoResolver.synthetic(PROJECT_DIR, false);
		this.pathTranslator = new PathTranslator(ROOT_DIR, OUT_DIR, undefined, false);
		this.nodeModulesPathMapping = new Map<string, string>();
	}

	public compileSource(source: string) {
		this.vfs.writeFile(PLAYGROUND_PATH, source);

		const rootNames = this.vfs
			.getFilePaths()
			.filter(v => v.endsWith(ts.Extension.Ts) || v.endsWith(ts.Extension.Tsx) || v.endsWith(ts.Extension.Dts));
		this.program = ts.createProgram(rootNames, this.compilerOptions, this.compilerHost, this.program);

		const typeChecker = this.program.getDiagnosticsProducingTypeChecker();

		let roactSymbolManager: RoactSymbolManager | undefined;
		const roactIndexSourceFile = this.program.getSourceFile(pathJoin(this.nodeModulesPath, "roact", "index.d.ts"));
		if (roactIndexSourceFile) {
			roactSymbolManager = new RoactSymbolManager(typeChecker, roactIndexSourceFile);
		}

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
			this.rojoResolver,
			this.pathTranslator,
			undefined,
			this.nodeModulesPath,
			[NODE_MODULES, RBXTS_SCOPE],
			this.nodeModulesPathMapping,
			typeChecker,
			typeChecker.getEmitResolver(sourceFile),
			new GlobalSymbols(typeChecker),
			new MacroManager(this.program, typeChecker, this.nodeModulesPath),
			roactSymbolManager,
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
