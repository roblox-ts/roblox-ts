#!/usr/bin/env node

import * as yargs from "yargs";

import * as fs from "fs";
import * as path from "path";
import { Compiler } from "./class/Compiler";

/* tslint:disable */
const versionStr = require("../package.json").version as string;
/* tslint:enable */

// cli interface
const argv = yargs
	.usage("Usage: $0 [options]")

	// version
	.alias("v", "version")
	.version(versionStr)
	.describe("version", "show version information")

	// help
	.alias("h", "help")
	.help("help")
	.describe("help", "show help")
	.showHelpOnFail(false, "specify --help for available options")

	// watch
	.option("w", {
		alias: "watch",
		boolean: true,
		describe: "enable watch mode",
	})

	// project
	.option("p", {
		alias: "project",
		default: ".",
		describe: "project path",
	})

	// includePath
	.option("i", {
		alias: "includePath",
		demandOption: true,
		describe: "path of folder to copy runtime .lua files to",
	})

	// parse
	.parse();

let configFilePath = path.resolve(argv.project as string);
const isWatchMode = argv.watch === true; // TODO

if (!fs.existsSync(configFilePath)) {
	throw new Error("Project path does not exist!");
}

if (fs.statSync(configFilePath).isDirectory()) {
	configFilePath = path.resolve(configFilePath, "tsconfig.json");
}

if (!fs.existsSync(configFilePath) || !fs.statSync(configFilePath).isFile()) {
	throw new Error("Cannot find tsconfig.json!");
}

const compiler = new Compiler(configFilePath, argv.includePath);
compiler.compile();
