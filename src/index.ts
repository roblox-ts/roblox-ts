#!/usr/bin/env node

import * as chokidar from "chokidar";
import * as fs from "fs";
import * as path from "path";
import * as yargs from "yargs";
import { Compiler } from "./class/Compiler";

const MAX_READ_ATTEMPTS = 5;
const READ_DELAY = 10;

/* tslint:disable */
const versionStr = require("../package.json").version as string;
/* tslint:enable */

// cli interface
const argv = yargs
	.usage("Usage: rbxtsc [options]")

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
		describe: "folder to copy runtime .lua files to",
	})

	// noInclude
	.option("noInclude", {
		default: false,
		describe: "do not copy runtime .lua files",
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

async function sleep(ms: number): Promise<void> {
	return new Promise<void>((resolve, reject) => setTimeout(() => resolve(), ms));
}

const noInclude = argv.noInclude === true;

const compiler = new Compiler(configFilePath, argv.includePath);
if (argv.watch === true) {
	const rootDir = compiler.rootDir;
	if (!rootDir) {
		throw new Error("Could not find rootDir!");
	}

	let isCompiling = false;

	const update = async (isInitial = false) => {
		console.log(isInitial ? "Starting initial compile.." : "Change detected, compiling..");
		const start = Date.now();
		await compiler.refresh();
		try {
			await compiler.compile(noInclude);
		} catch (e) {}
		console.log(`Done, took ${Date.now() - start} ms!`);
	};

	chokidar
		.watch(rootDir, {
			ignoreInitial: true,
		})
		.on("change", async (filePath: string) => {
			if (!isCompiling) {
				isCompiling = true;
				// hack for chokidar sometimes getting empty files
				// wait up to 50ms for actually empty files
				let attempts = 0;
				while (fs.readFileSync(filePath).length === 0 && attempts < MAX_READ_ATTEMPTS) {
					attempts++;
					await sleep(READ_DELAY);
				}
				await update();
				isCompiling = false;
			}
		})
		.on("add", async (filePath: string) => {
			if (!isCompiling) {
				isCompiling = true;
				console.log("Add", filePath);
				compiler.addFile(filePath);
				await update();
				isCompiling = false;
			}
		})
		.on("unlink", async (filePath: string) => {
			if (!isCompiling) {
				isCompiling = true;
				console.log("Remove", filePath);
				compiler.removeFile(filePath);
				await update();
				isCompiling = false;
			}
		});

	console.log("Running in watch mode..");
	update(true);
} else {
	try {
		compiler.compile(noInclude);
	} catch (e) {
		process.exit(1);
	}
}
