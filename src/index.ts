#!/usr/bin/env node

import * as chokidar from "chokidar";
import * as fs from "fs";
import * as path from "path";
import * as yargs from "yargs";
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
		default: "include",
		describe: "path of folder to copy runtime .lua files to",
	})

	// parse
	.parse();

let configFilePath = path.resolve(argv.project as string);

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
if (argv.watch === true) {
	const rootDir = compiler.project.getCompilerOptions().rootDir;
	if (!rootDir) {
		throw new Error("Could not find rootDir!");
	}

	const update = async (isInitial = false) => {
		console.log(isInitial ? "Starting initial compile.." : "Change detected, compiling..");
		const start = Date.now();
		compiler.refreshSync();
		await compiler.compile();
		console.log(`Done, took ${Date.now() - start} ms!`);
	};

	chokidar
		.watch(rootDir, {
			ignoreInitial: true,
		})
		.on("change", (path: string) => {
			update();
		})
		.on("add", (path: string) => {
			console.log("Add", path);
			compiler.addFile(path);
			update();
		})
		.on("unlink", (path: string) => {
			console.log("Remove", path);
			compiler.removeFile(path);
			update();
		});

	console.log("Running in watch mode..");
	update(true);
} else {
	compiler.compile();
}
