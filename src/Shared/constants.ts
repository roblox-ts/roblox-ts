export const TS_EXT = "ts";
export const TSX_EXT = "tsx";
export const TS_REGEX = /tsx?/;
export const D_EXT = "d";
export const LUA_EXT = "lua";
export const JSON_EXT = "json";

export const INDEX_NAME = "index";
export const INIT_NAME = "init";

export const SERVER_SUBEXT = "server";
export const CLIENT_SUBEXT = "client";
export const MODULE_SUBEXT = "";

/**
 * The type of project. Either Game, Model, or Package.
 */
export enum ProjectType {
	Game,
	Model,
	Package,
}
