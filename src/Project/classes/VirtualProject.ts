import ts from "byots";
import { renderAST } from "LuauRenderer";
import { pathJoin, PATH_SEP, VirtualFileSystem } from "Project/classes/VirtualFileSystem";
import { validateCompilerOptions } from "Project/functions/validateCompilerOptions";
import { ProjectData, ProjectServices } from "Project/types";
import { getCustomPreEmitDiagnostics } from "Project/util/getCustomPreEmitDiagnostics";
import { PathTranslator } from "Shared/classes/PathTranslator";
import { RojoResolver, RbxPath } from "Shared/classes/RojoResolver";
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
	private readonly data: ProjectData;

	public readonly vfs: VirtualFileSystem;

	private readonly compilerOptions: ts.CompilerOptions;
	private readonly rojoResolver: RojoResolver;
	private readonly compilerHost: ts.CompilerHost;

	private program: ts.Program | undefined;
	private typeChecker: ts.TypeChecker | undefined;

	constructor() {
		this.data = {
			includePath: "",
			isPackage: false,
			nodeModulesPath: pathJoin(PROJECT_DIR, NODE_MODULES, RBXTS_SCOPE),
			nodeModulesPathMapping: new Map(),
			noInclude: false,
			pkgVersion: "",
			projectOptions: { includePath: "", rojo: "", type: ProjectType.Model },
			projectPath: "",
			rojoConfigPath: undefined,
			tsConfigPath: "",
		};

		this.compilerOptions = {
			allowSyntheticDefaultImports: true,
			downlevelIteration: true,
			noLib: true,
			strict: true,
			target: ts.ScriptTarget.ESNext,
			moduleResolution: ts.ModuleResolutionKind.NodeJs,
			typeRoots: [this.data.nodeModulesPath],
			resolveJsonModule: true,
			rootDir: ROOT_DIR,
			outDir: OUT_DIR,
			jsx: ts.JsxEmit.React,
			jsxFactory: "Roact.createElement",
		};
		validateCompilerOptions(this.compilerOptions, this.data.nodeModulesPath);

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
	}

	private createServices(): ProjectServices {
		assert(this.program && this.typeChecker);
		const globalSymbols = new GlobalSymbols(this.typeChecker);
		const macroManager = new MacroManager(this.program, this.typeChecker, this.data.nodeModulesPath);
		const pathTranslator = new PathTranslator(ROOT_DIR, OUT_DIR, undefined, false);
		const roactIndexSourceFile = this.program.getSourceFile(
			pathJoin(this.data.nodeModulesPath, "roact", "index.d.ts"),
		);
		const roactSymbolManager = roactIndexSourceFile
			? new RoactSymbolManager(this.typeChecker, roactIndexSourceFile)
			: undefined;
		return {
			globalSymbols,
			macroManager,
			pathTranslator,
			roactSymbolManager,
		};
	}

	public compileSource(source: string) {
		this.vfs.writeFile(PLAYGROUND_PATH, source);

		const rootNames = this.vfs
			.getFilePaths()
			.filter(v => v.endsWith(ts.Extension.Ts) || v.endsWith(ts.Extension.Tsx) || v.endsWith(ts.Extension.Dts));
		this.program = ts.createProgram(rootNames, this.compilerOptions, this.compilerHost, this.program);
		this.typeChecker = this.program.getDiagnosticsProducingTypeChecker();

		const services = this.createServices();

		const sourceFile = this.program.getSourceFile(PLAYGROUND_PATH);
		assert(sourceFile);

		const diagnostics = new Array<ts.Diagnostic>();
		if (diagnostics.push(...getCustomPreEmitDiagnostics(sourceFile)) > 0) throw new DiagnosticError(diagnostics);
		if (diagnostics.push(...ts.getPreEmitDiagnostics(this.program, sourceFile)) > 0)
			throw new DiagnosticError(diagnostics);

		const multiTransformState = new MultiTransformState();

		const runtimeLibRbxPath = undefined;
		const nodeModulesRbxPath: RbxPath = [];
		const projectType = this.data.projectOptions.type!;

		const transformState = new TransformState(
			this.data,
			services,
			multiTransformState,
			this.compilerOptions,
			this.rojoResolver,
			runtimeLibRbxPath,
			nodeModulesRbxPath,
			this.typeChecker,
			projectType,
			sourceFile,
		);

		const luaAST = transformSourceFile(transformState, sourceFile);
		diagnostics.push(...transformState.diagnostics);
		if (diagnostics.length > 0) throw new DiagnosticError(diagnostics);

		const luaSource = renderAST(luaAST);
		return luaSource;
	}
}
