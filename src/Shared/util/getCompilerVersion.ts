/* eslint-disable @typescript-eslint/no-require-imports */

const PRODUCTION = "production";
const { NODE_ENV = PRODUCTION } = process.env;

let VERSION = (require("./../../../package.json") as { version: string }).version;
if (NODE_ENV !== PRODUCTION) {
	VERSION += `-${Date.now()}`;
}

export function getCompilerVersion() {
	return VERSION;
}
