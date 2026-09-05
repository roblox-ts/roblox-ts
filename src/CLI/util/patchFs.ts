/* eslint-disable @typescript-eslint/ban-ts-comment -- necessary to override readonly functions */

import fs from "fs-extra";

// hack to fix playground without removing fs calls

const NOOP = () => {};
const ASYNC_NOOP = async () => {};

fs.copy ??= ASYNC_NOOP;
fs.copySync ??= NOOP;
fs.existsSync ??= () => false;
fs.outputFile ??= ASYNC_NOOP;
fs.outputFileSync ??= NOOP;
fs.pathExists ??= async () => false;
fs.pathExistsSync ??= () => false;
// @ts-ignore
fs.readdir ??= async () => [];
fs.readdirSync ??= () => [];
// @ts-ignore
fs.readFileSync ??= () => Buffer.from("") as Buffer & string;
// @ts-ignore
fs.readJson ??= ASYNC_NOOP;
// @ts-ignore
fs.readJSONSync ??= NOOP;
fs.realpathSync ??= ((path: fs.PathLike) => path) as typeof fs.realpathSync;
fs.removeSync ??= NOOP;
// @ts-ignore
fs.stat ??= () => ({}) as Promise<fs.Stats>;
// @ts-ignore
fs.statSync ??= () => ({});
