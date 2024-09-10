import path from "path";
import { ProjectOptions } from "Shared/types";

export const PACKAGE_ROOT = path.join(__dirname, "..", "..");
export const INCLUDE_PATH = path.join(PACKAGE_ROOT, "include");

// intentionally not using PACKAGE_ROOT because playground has webpack issues
// eslint-disable-next-line @typescript-eslint/no-require-imports -- can't use an import because it's outside the project
export const COMPILER_VERSION: string = require("../../package.json").version;

export const NODE_MODULES = "node_modules";
export const RBXTS_SCOPE = "@rbxts";

export const TS_EXT = ".ts";
export const TSX_EXT = ".tsx";
export const D_EXT = ".d";
export const DTS_EXT = D_EXT + TS_EXT;

export const INDEX_NAME = "index";
export const INIT_NAME = "init";

export const SERVER_SUBEXT = ".server";
export const CLIENT_SUBEXT = ".client";
export const MODULE_SUBEXT = "";

export const FILENAME_WARNINGS = new Map<string, string>();
for (const scriptType of [SERVER_SUBEXT, CLIENT_SUBEXT, MODULE_SUBEXT]) {
	for (const fileType of [TS_EXT, TSX_EXT, DTS_EXT]) {
		FILENAME_WARNINGS.set(INIT_NAME + scriptType + fileType, INDEX_NAME + scriptType + fileType);
	}
}

export const PARENT_FIELD = "Parent";

export enum ProjectType {
	Game = "game",
	Model = "model",
	Package = "package",
}

export const DEFAULT_PROJECT_OPTIONS: ProjectOptions = {
	includePath: "",
	rojo: undefined,
	type: undefined,
	watch: false,
	usePolling: false,
	verbose: false,
	noInclude: false,
	logTruthyChanges: false,
	writeOnlyChanged: false,
	writeTransformedFiles: false,
	optimizedLoops: true,
	allowCommentDirectives: false,
	luau: true,
};
