import ts from "byots";
import {
	MultiTransformState,
	TransformState,
	transformSourceFile,
	GlobalSymbols,
	MacroManager,
	RoactSymbolManager,
} from "TSTransformer";
import { getCustomPreEmitDiagnostics } from "Project/util/getCustomPreEmitDiagnostics";
import { renderAST } from "LuaRenderer";
import { RojoConfig, RbxPath } from "Shared/RojoConfig";
import { PathTranslator } from "Shared/PathTranslator";
import { ProjectType } from "Shared/constants";

export class VirtualProject {
	private readonly program: ts.Program;
	private readonly compilerOptions: ts.CompilerOptions;
	private readonly rojoConfig: RojoConfig;
	private readonly pathTranslator: PathTranslator;
	private readonly runtimeLibRbxPath: RbxPath;
	private readonly nodeModulesPath: string;
	private readonly nodeModulesRbxPath: RbxPath;
	private readonly nodeModulesPathMapping: Map<string, string>;
	private readonly typeChecker: ts.TypeChecker;
	private readonly globalSymbols: GlobalSymbols;
	private readonly macroManager: MacroManager;
	private readonly roactSymbolManager: RoactSymbolManager | undefined;
	private readonly projectType: ProjectType;
	private readonly pkgVersion: string;

	constructor() {
		const rootDir = "src";
		const outDir = "out";
		this.nodeModulesPath = "node_modules/@rbxts";

		this.compilerOptions = {
			allowSyntheticDefaultImports: true,
			downlevelIteration: true,
			noLib: true,
			strict: true,
			target: ts.ScriptTarget.ESNext,
			moduleResolution: ts.ModuleResolutionKind.NodeJs,
			typeRoots: [this.nodeModulesPath],
			resolveJsonModule: true,
			rootDir,
			outDir,
			jsx: ts.JsxEmit.React,
			jsxFactory: "React.createElement",
		};

		this.program = ts.createProgram({ rootNames: [], options: this.compilerOptions });
		this.rojoConfig = RojoConfig.synthetic("/");
		this.pathTranslator = new PathTranslator(rootDir, outDir, undefined);
		this.runtimeLibRbxPath = [];
		this.nodeModulesRbxPath = [];
		this.nodeModulesPathMapping = new Map<string, string>();
		this.typeChecker = this.program.getTypeChecker();
		this.globalSymbols = new GlobalSymbols(this.typeChecker);
		this.macroManager = new MacroManager(this.program, this.typeChecker, this.nodeModulesPath);
		this.roactSymbolManager = undefined;
		this.projectType = ProjectType.Model;
		this.pkgVersion = "playground";
	}

	private virtualFileId = 1;
	public compileSource(source: string) {
		const multiTransformState = new MultiTransformState();
		const totalDiagnostics = new Array<ts.Diagnostic>();

		const sourceFile = ts.createSourceFile(`file_${this.virtualFileId++}.ts`, source, ts.ScriptTarget.ESNext);

		const customPreEmitDiagnostics = getCustomPreEmitDiagnostics(sourceFile);
		totalDiagnostics.push(...customPreEmitDiagnostics);
		if (totalDiagnostics.length > 0) return;

		const preEmitDiagnostics = ts.getPreEmitDiagnostics(this.program, sourceFile);
		totalDiagnostics.push(...preEmitDiagnostics);
		if (totalDiagnostics.length > 0) return;

		// create a new transform state for the file
		const transformState = new TransformState(
			this.compilerOptions,
			multiTransformState,
			this.rojoConfig,
			this.pathTranslator,
			this.runtimeLibRbxPath,
			this.nodeModulesPath,
			this.nodeModulesRbxPath,
			this.nodeModulesPathMapping,
			this.typeChecker,
			this.globalSymbols,
			this.macroManager,
			this.roactSymbolManager,
			this.projectType,
			this.pkgVersion,
			sourceFile,
		);

		const luaAST = transformSourceFile(transformState, sourceFile);
		totalDiagnostics.push(...transformState.diagnostics);
		if (totalDiagnostics.length > 0) return;

		const luaSource = renderAST(luaAST);
		return luaSource;
	}
}
