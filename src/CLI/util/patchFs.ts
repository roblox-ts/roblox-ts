import fs from "fs-extra";

// hack to fix playground without removing fs calls

const NOOP = () => {};
const ASYNC_NOOP = async () => {};

fs.copy ??= ASYNC_NOOP;
fs.copySync ??= NOOP;
fs.existsSync ??= () => false;
fs.outputFile ??= ASYNC_NOOP;
fs.outputFileSync ??= NOOP;
// eslint-disable-next-line @typescript-eslint/require-await
fs.pathExists ??= async () => false;
fs.pathExistsSync ??= () => false;
// eslint-disable-next-line @typescript-eslint/require-await
fs.readdir ??= async () => [];
fs.readdirSync ??= () => [];
fs.readFileSync ??= () => Buffer.from("") as Buffer & string;
fs.readJson ??= ASYNC_NOOP;
fs.readJSONSync ??= NOOP;
fs.realpathSync ??= ((path: fs.PathLike) => path) as typeof fs.realpathSync;
fs.removeSync ??= NOOP;
fs.stat ??= () => ({} as Promise<fs.Stats>);
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
fs.statSync ??= () => ({});
