import { PathTranslator } from "Shared/classes/PathTranslator";
import { ProjectType } from "Shared/constants";
import { GlobalSymbols, MacroManager, RoactSymbolManager } from "TSTransformer";

export interface ProjectOptions {
	includePath: string;
	rojo: string;
	type: ProjectType | undefined;
}

/** Optional flags that add alternate behavior to project. */
export interface ProjectFlags {
	noInclude: boolean;
	project: string;
	verbose: boolean;
	watch: boolean;
	usePolling: boolean;
}

export interface ProjectServices {
	globalSymbols: GlobalSymbols;
	macroManager: MacroManager;
	pathTranslator: PathTranslator;
	roactSymbolManager: RoactSymbolManager | undefined;
}

export interface ProjectData {
	includePath: string;
	isPackage: boolean;
	nodeModulesPath: string;
	nodeModulesPathMapping: Map<string, string>;
	noInclude: boolean;
	pkgVersion: string;
	projectOptions: ProjectOptions;
	projectPath: string;
	rojoConfigPath: string | undefined;
	tsConfigPath: string;
}
