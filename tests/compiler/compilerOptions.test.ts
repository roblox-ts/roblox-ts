import path from "path";
import { validateCompilerOptions } from "Project/functions/validateCompilerOptions";
import { PACKAGE_ROOT } from "Shared/constants";
import { ProjectError } from "Shared/errors/ProjectError";
import ts from "typescript";

const projectPath = path.join(PACKAGE_ROOT, "tests");
const options: ts.CompilerOptions = {
	allowSyntheticDefaultImports: true,
	moduleDetection: ts.ModuleDetectionKind.Force,
	noLib: true,
	outDir: path.join(projectPath, "out"),
	rootDir: path.join(projectPath, "src"),
	strict: true,
	target: ts.ScriptTarget.ESNext,
	typeRoots: [path.join(projectPath, "node_modules/@rbxts")],
};

it.each([
	// eslint-disable-next-line @typescript-eslint/no-deprecated -- cover legacy configs using ignoreDeprecations
	["CommonJS/Node", ts.ModuleKind.CommonJS, ts.ModuleResolutionKind.Node10],
	["CommonJS/Bundler", ts.ModuleKind.CommonJS, ts.ModuleResolutionKind.Bundler],
])("accepts %s", (name, module, moduleResolution) => {
	expect(() => validateCompilerOptions({ ...options, module, moduleResolution }, projectPath)).not.toThrow();
});

it.each([
	["CommonJS/NodeNext", ts.ModuleKind.CommonJS, ts.ModuleResolutionKind.NodeNext],
	["Preserve/Bundler", ts.ModuleKind.Preserve, ts.ModuleResolutionKind.Bundler],
	// eslint-disable-next-line @typescript-eslint/no-deprecated -- reject an invalid legacy resolution combination
	["Preserve/Node", ts.ModuleKind.Preserve, ts.ModuleResolutionKind.Node10],
	["NodeNext", ts.ModuleKind.NodeNext, ts.ModuleResolutionKind.NodeNext],
	["ESNext/Bundler", ts.ModuleKind.ESNext, ts.ModuleResolutionKind.Bundler],
])("rejects %s", (name, module, moduleResolution) => {
	expect(() => validateCompilerOptions({ ...options, module, moduleResolution }, projectPath)).toThrow(ProjectError);
});
