import { PathTranslator } from "Shared/classes/PathTranslator";
import { ProjectType } from "Shared/constants";
import { GlobalSymbols, MacroManager, RoactSymbolManager } from "TSTransformer";

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

export interface ProjectServices {
	globalSymbols: GlobalSymbols;
	macroManager: MacroManager;
	pathTranslator: PathTranslator;
	roactSymbolManager: RoactSymbolManager | undefined;
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
