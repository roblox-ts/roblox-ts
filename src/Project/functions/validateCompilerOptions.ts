import kleur from "kleur";
import path from "path";
import { RBXTS_SCOPE } from "Shared/constants";
import { ProjectError } from "Shared/errors/ProjectError";
import ts from "typescript";

const ENFORCED_OPTIONS = {
	target: ts.ScriptTarget.ESNext,
	module: ts.ModuleKind.CommonJS,
	moduleResolution: ts.ModuleResolutionKind.NodeJs,
	noLib: true,
	strict: true,
	allowSyntheticDefaultImports: true,
} as const;

/** shorthand for kleur.yellow */
function y(str: string) {
	return kleur.yellow(str);
}

function validateTypeRoots(nodeModulesPath: string, typeRoots: Array<string>) {
	const typesPath = path.resolve(nodeModulesPath);
	for (const typeRoot of typeRoots) {
		if (path.normalize(typeRoot) === typesPath) {
			return true;
		}
	}
	return false;
}

export function validateCompilerOptions(opts: ts.CompilerOptions, nodeModulesPath: string) {
	const errors = new Array<string>();

	// required compiler options
	if (opts.noLib !== ENFORCED_OPTIONS.noLib) {
		errors.push(`${y(`"noLib"`)} must be ${y(`true`)}`);
	}

	if (opts.strict !== ENFORCED_OPTIONS.strict) {
		errors.push(`${y(`"strict"`)} must be ${y(`true`)}`);
	}

	if (opts.target !== ENFORCED_OPTIONS.target) {
		// errors.push(`${y(`"target"`)} must be ${y(`"ESNext"`)}`);
	}

	if (opts.module !== ENFORCED_OPTIONS.module) {
		errors.push(`${y(`"module"`)} must be ${y(`commonjs`)}`);
	}

	if (opts.moduleResolution !== ENFORCED_OPTIONS.moduleResolution) {
		errors.push(`${y(`"moduleResolution"`)} must be ${y(`"Node"`)}`);
	}

	if (opts.allowSyntheticDefaultImports !== ENFORCED_OPTIONS.allowSyntheticDefaultImports) {
		errors.push(`${y(`"allowSyntheticDefaultImports"`)} must be ${y(`true`)}`);
	}

	const rbxtsModules = path.join(nodeModulesPath, RBXTS_SCOPE);
	if (opts.typeRoots === undefined || !validateTypeRoots(rbxtsModules, opts.typeRoots)) {
		errors.push(`${y(`"typeRoots"`)} must contain ${y(rbxtsModules)}`);
	}

	// configurable compiler options
	if (opts.rootDir === undefined && opts.rootDirs === undefined) {
		errors.push(`${y(`"rootDir"`)} or ${y(`"rootDirs"`)} must be defined`);
	}

	if (opts.outDir === undefined) {
		errors.push(`${y(`"outDir"`)} must be defined`);
	}

	// throw if errors
	if (errors.length > 0) {
		throw new ProjectError(
			[
				`Invalid "tsconfig.json" configuration!`,
				`https://roblox-ts.com/docs/quick-start#project-folder-setup`, // TODO update
				errors.map(e => `- ${e}\n`).join(""),
			].join("\n"),
		);
	}
}
