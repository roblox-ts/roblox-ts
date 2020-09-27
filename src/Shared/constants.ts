import path from "path";

export const PACKAGE_ROOT = path.join(__dirname, "..", "..");
export const LIB_PATH = path.join(PACKAGE_ROOT, "lib");

// intentionally not using PACKAGE_ROOT because playground has webpack issues
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
export const COMPILER_VERSION = require("../../package.json").version;

export const NODE_MODULES = "node_modules";
export const RBXTS_SCOPE = "@rbxts";

export const TS_EXT = ".ts";
export const TSX_EXT = ".tsx";
export const D_EXT = ".d";
export const DTS_EXT = D_EXT + TS_EXT;
export const LUA_EXT = ".lua";
export const JSON_EXT = ".json";

export const INDEX_NAME = "index";
export const INIT_NAME = "init";

export const SERVER_SUBEXT = ".server";
export const CLIENT_SUBEXT = ".client";
export const MODULE_SUBEXT = "";

export const PARENT_FIELD = "Parent";

export enum ProjectType {
	Game = "game",
	Model = "model",
	Package = "package",
}
