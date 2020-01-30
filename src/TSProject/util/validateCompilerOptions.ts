import chalk from "chalk";
import ts from "typescript";
import path from "path";
import { ProjectError } from "TSProject/errors/ProjectError";

// force colors
chalk.level = 1;

const ENFORCED_OPTIONS = {
	downlevelIteration: true,
	module: ts.ModuleKind.CommonJS,
	noLib: true,
	strict: true,
	target: ts.ScriptTarget.ES2015,
	allowSyntheticDefaultImports: true,
	isolatedModules: true,
} as const;

type NotUndefined<T> = T extends undefined ? never : T;

interface ExtraOptionChecks {
	typeRoots: NotUndefined<ts.CompilerOptions["typeRoots"]>;
	outDir: NotUndefined<ts.CompilerOptions["outDir"]>;
	jsx?: ts.JsxEmit.React;
	jsxFactory?: "Roact.createElement";
}

/** shorthand for chalk.yellowBright */
function y(str: string) {
	return chalk.yellowBright(str);
}

export function validateCompilerOptions(
	opts: ts.CompilerOptions,
): asserts opts is ts.CompilerOptions & typeof ENFORCED_OPTIONS & ExtraOptionChecks {
	const errors = new Array<string>();

	// required compiler options
	if (opts.downlevelIteration !== ENFORCED_OPTIONS.downlevelIteration) {
		errors.push(`${y(`"downlevelIteration"`)} must be ${y(`true`)}`);
	}
	if (opts.module !== ENFORCED_OPTIONS.module) {
		errors.push(`${y(`"module"`)} must be ${y(`"commonjs"`)}`);
	}
	if (opts.noLib !== ENFORCED_OPTIONS.noLib) {
		errors.push(`${y(`"noLib"`)} must be ${y(`true`)}`);
	}
	if (opts.strict !== ENFORCED_OPTIONS.strict) {
		errors.push(`${y(`"strict"`)} must be ${y(`true`)}`);
	}
	if (opts.target !== ENFORCED_OPTIONS.target) {
		errors.push(`${y(`"target"`)} must be ${y(`"es6"`)}`);
	}
	if (opts.allowSyntheticDefaultImports !== ENFORCED_OPTIONS.allowSyntheticDefaultImports) {
		errors.push(`${y(`"allowSyntheticDefaultImports"`)} must be ${y(`true`)}`);
	}
	if (opts.isolatedModules !== ENFORCED_OPTIONS.isolatedModules) {
		errors.push(`${y(`"isolatedModules"`)} must be ${y(`true`)}`);
	}

	let typesFound = false;
	if (opts.typeRoots) {
		const typesPath = path.resolve(this.modulesPath, "@rbxts");
		for (const typeRoot of opts.typeRoots) {
			if (path.normalize(typeRoot) === typesPath) {
				typesFound = true;
				break;
			}
		}
	}

	if (!typesFound) {
		errors.push(`${y(`"typeRoots"`)} must contain ${y(`[ "node_modules/@rbxts" ]`)}`);
	}

	// configurable compiler options
	if (opts.rootDir === undefined && opts.rootDirs === undefined) {
		errors.push(`${y(`"rootDir"`)} or ${y(`"rootDirs"`)} must be defined`);
	}
	if (opts.outDir === undefined) {
		errors.push(`${y(`"outDir"`)} must be defined`);
	}

	// roact compiler options
	if (opts.jsx !== undefined && opts.jsx !== ts.JsxEmit.React) {
		errors.push(`${y(`"jsx"`)} must be ${y(`"react"`)} or not defined`);
	}
	if (opts.jsxFactory !== undefined && opts.jsxFactory !== "Roact.createElement") {
		errors.push(`${y(`"jsxFactory"`)} must be ${y(`"Roact.createElement"`)} or not defined`);
	}

	// throw if errors
	if (errors.length > 0) {
		throw new ProjectError(
			[
				`Invalid "tsconfig.json" configuration!`,
				`https://roblox-ts.github.io/docs/quick-start#project-folder-setup`,
				errors.map(e => `- ${e}\n`).join(""),
			].join("\n"),
		);
	}
}
