#!/usr/bin/env node
if (process.env.NODE_ENV === undefined) {
	process.env.NODE_ENV = "development";
}
require(`${__dirname}/../out/CLI/cli.js`);
