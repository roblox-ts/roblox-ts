import { ProjectType } from "Shared/constants";

export interface ProjectOptions {
	includePath: string;
	rojo: string | undefined;
	type: ProjectType | undefined;
}

/** Optional flags that add alternate behavior to project. */
export interface ProjectFlags {
	logStringChanges: boolean;
	logTruthyChanges: boolean;
	noInclude: boolean;
	project: string;
	usePolling: boolean;
	verbose: boolean;
	watch: boolean;
	writeOnlyChanged: boolean;
}

export interface ProjectData {
	includePath: string;
	isPackage: boolean;
	logStringChanges: boolean;
	logTruthyChanges: boolean;
	nodeModulesPath: string;
	nodeModulesPathMapping: Map<string, string>;
	noInclude: boolean;
	pkgVersion: string;
	projectOptions: ProjectOptions;
	projectPath: string;
	rojoConfigPath: string | undefined;
	tsConfigPath: string;
	writeOnlyChanged: boolean;
}

export interface TransformerPluginConfig {
	/**
	 * Path to transformer or transformer module name
	 */
	transform?: string;

	/**
	 * The optional name of the exported transform plugin in the transform module.
	 */
	import?: string;

	/**
	 * Plugin entry point format type, default is program
	 */
	type?: "program" | "config" | "checker" | "raw" | "compilerOptions";

	/**
	 * Should transformer applied after all ones
	 */
	after?: boolean;

	/**
	 * Should transformer applied for d.ts files, supports from TS2.9
	 */
	afterDeclarations?: boolean;

	/**
	 * any other properties provided to the transformer as config argument
	 * */
	[options: string]: unknown;
}
