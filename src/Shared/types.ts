import { ProjectType } from "Shared/constants";
import ts from "typescript";

export interface ProjectOptions {
	includePath: string;
	rojo: string | undefined;
	type: ProjectType | undefined;
	logTruthyChanges: boolean;
	noInclude: boolean;
	usePolling: boolean;
	verbose: boolean;
	watch: boolean;
	writeOnlyChanged: boolean;
	optimizedLoops: boolean;
	allowCommentDirectives: boolean;
}

export interface ProjectData {
	includePath: string;
	isPackage: boolean;
	logTruthyChanges: boolean;
	nodeModulesPath: string;
	noInclude: boolean;
	projectOptions: ProjectOptions;
	projectPath: string;
	rojoConfigPath: string | undefined;
	tsConfigPath: string;
	writeOnlyChanged: boolean;
	optimizedLoops: boolean;
	watch: boolean;
	transformerWatcher?: TransformerWatcher;
}

export interface TransformerWatcher {
	service: ts.LanguageService;
	updateFile: (fileName: string, text: string) => void;
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

export interface SourceFileWithTextRange {
	sourceFile: ts.SourceFile;
	range: ts.ReadonlyTextRange;
}
