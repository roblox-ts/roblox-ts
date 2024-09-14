import { renderAST } from "@roblox-ts/luau-ast";
import { PathTranslator } from "@roblox-ts/path-translator";
import { RojoResolver } from "@roblox-ts/rojo-resolver";
import { PATH_SEP, pathJoin, VirtualFileSystem } from "Project/classes/VirtualFileSystem";
import { validateCompilerOptions } from "Project/functions/validateCompilerOptions";
import { getCustomPreEmitDiagnostics } from "Project/util/getCustomPreEmitDiagnostics";
import { DEFAULT_PROJECT_OPTIONS, NODE_MODULES, ProjectType, RBXTS_SCOPE } from "Shared/constants";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { ProjectData } from "Shared/types";
import { assert } from "Shared/util/assert";
import { hasErrors } from "Shared/util/hasErrors";
import { MultiTransformState, transformSourceFile, TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { createTransformServices } from "TSTransformer/util/createTransformServices";
import ts from "typescript";

const PROJECT_DIR = PATH_SEP;
const ROOT_DIR = pathJoin(PROJECT_DIR, "src");
const OUT_DIR = pathJoin(PROJECT_DIR, "out");
const PLAYGROUND_PATH = pathJoin(ROOT_DIR, "playground.tsx");
const NODE_MODULES_PATH = pathJoin(PROJECT_DIR, NODE_MODULES);
const RBXTS_SCOPE_PATH = pathJoin(NODE_MODULES_PATH, RBXTS_SCOPE);
const INCLUDE_PATH = pathJoin(PROJECT_DIR, "include");

export class VirtualProject {
	private readonly data: ProjectData;

	public readonly vfs: VirtualFileSystem;

	private readonly compilerOptions: ts.CompilerOptions;
	private readonly rojoResolver: RojoResolver;
	private readonly pkgRojoResolvers: Array<RojoResolver>;
	private readonly compilerHost: ts.CompilerHost;

	private program: ts.Program | undefined;
	private typeChecker: ts.TypeChecker | undefined;
	private nodeModulesPathMapping = new Map<string, string>();

	constructor() {
		this.data = {
			isPackage: false,
			nodeModulesPath: NODE_MODULES_PATH,
			projectOptions: Object.assign({}, DEFAULT_PROJECT_OPTIONS, {
				rojo: "",
				type: ProjectType.Model,
				optimizedLoops: true,
			}),
			projectPath: PROJECT_DIR,
			rojoConfigPath: undefined,
			tsConfigPath: "",
		};

		this.compilerOptions = {
			allowSyntheticDefaultImports: true,
			downlevelIteration: true,
			noLib: true,
			strict: true,
			target: ts.ScriptTarget.ESNext,
			module: ts.ModuleKind.CommonJS,
			moduleResolution: ts.ModuleResolutionKind.Node10,
			moduleDetection: ts.ModuleDetectionKind.Force,
			typeRoots: [RBXTS_SCOPE_PATH],
			resolveJsonModule: true,
			experimentalDecorators: true,
			rootDir: ROOT_DIR,
			outDir: OUT_DIR,
			jsx: ts.JsxEmit.React,
			jsxFactory: "React.createElement",
			jsxFragmentFactory: "React.Fragment",
		};
		validateCompilerOptions(this.compilerOptions, this.data.projectPath);

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

		this.rojoResolver = RojoResolver.fromTree(PROJECT_DIR, {
			$path: OUT_DIR,
			include: {
				$path: INCLUDE_PATH,
				node_modules: {
					$className: "Folder",
					"@rbxts": {
						$path: RBXTS_SCOPE_PATH,
					},
				},
			},
		} as never);
		this.pkgRojoResolvers = this.compilerOptions.typeRoots!.map(RojoResolver.synthetic);
	}

	public compileSource(source: string) {
		this.vfs.writeFile(PLAYGROUND_PATH, source);

		const rootNames = this.vfs
			.getFilePaths()
			.filter(v => v.endsWith(ts.Extension.Ts) || v.endsWith(ts.Extension.Tsx) || v.endsWith(ts.Extension.Dts));
		this.program = ts.createProgram(rootNames, this.compilerOptions, this.compilerHost, this.program);
		this.typeChecker = this.program.getTypeChecker();

		const services = createTransformServices(this.typeChecker);
		const pathTranslator = new PathTranslator(ROOT_DIR, OUT_DIR, undefined, false, this.data.projectOptions.luau);

		const sourceFile = this.program.getSourceFile(PLAYGROUND_PATH);
		assert(sourceFile);

		const diagnostics = new Array<ts.Diagnostic>();
		diagnostics.push(...ts.getPreEmitDiagnostics(this.program, sourceFile));
		diagnostics.push(...getCustomPreEmitDiagnostics(this.data, sourceFile));
		if (hasErrors(diagnostics)) throw new DiagnosticError(diagnostics);

		const multiTransformState = new MultiTransformState();

		const runtimeLibRbxPath = undefined;
		const projectType = this.data.projectOptions.type!;

		const transformState = new TransformState(
			this.program,
			this.data,
			services,
			pathTranslator,
			multiTransformState,
			this.compilerOptions,
			this.rojoResolver,
			this.pkgRojoResolvers,
			this.nodeModulesPathMapping,
			runtimeLibRbxPath,
			this.typeChecker,
			projectType,
			sourceFile,
		);

		const luaAST = transformSourceFile(transformState, sourceFile);
		diagnostics.push(...DiagnosticService.flush());
		if (hasErrors(diagnostics)) throw new DiagnosticError(diagnostics);

		const luaSource = renderAST(luaAST);
		return luaSource;
	}

	public setMapping(typings: string, main: string) {
		this.nodeModulesPathMapping.set(typings, main);
	}
}
