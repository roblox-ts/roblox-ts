#!/usr/bin/env node

import * as chokidar from "chokidar";
import * as fs from "fs";
import * as path from "path";
import * as yargs from "yargs";
import { Compiler } from "./class/Compiler";
import { CompilerError } from "./class/errors/CompilerError";
import { TranspilerError } from "./class/errors/TranspilerError";

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

	// modulesPath
	.option("modulesPath", {
		default: "modules",
		describe: "folder to copy .lua files from node_modules to",
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

function isTSFile(filePath: string) {
	const ext = path.extname(filePath);
	return ext === ".ts" || ext === ".tsx";
}

const noInclude = argv.noInclude === true;

const compiler = new Compiler(configFilePath, argv.includePath, argv.modulesPath);
if (argv.watch === true) {
	const rootDir = compiler.getRootDirOrThrow();
	let isCompiling = false;

	const time = async (callback: () => any) => {
		const start = Date.now();
		try {
			await callback();
		} catch (e) {
			if (e instanceof CompilerError || e instanceof TranspilerError) {
				process.exitCode = 0;
			} else {
				throw e;
			}
		}
		console.log(`Done, took ${Date.now() - start} ms!`);
	};

	const update = async (filePath: string) => {
		console.log("Change detected, compiling..");
		await compiler.refresh();
		await time(async () => {
			await compiler.compileFileByPath(filePath, noInclude);
		});
	};

	chokidar
		.watch(rootDir, {
			awaitWriteFinish: {
				pollInterval: 10,
				stabilityThreshold: 50,
			},
			ignoreInitial: true,
			ignorePermissionErrors: true,
			interval: 100,
			usePolling: true,
		})
		.on("change", async (filePath: string) => {
			if (!isCompiling && isTSFile(filePath)) {
				isCompiling = true;
				await update(filePath);
				isCompiling = false;
			}
		})
		.on("add", async (filePath: string) => {
			if (!isCompiling && isTSFile(filePath)) {
				isCompiling = true;
				console.log("Add", filePath);
				compiler.addFile(filePath);
				await update(filePath);
				isCompiling = false;
			}
		})
		.on("unlink", async (filePath: string) => {
			if (!isCompiling && isTSFile(filePath)) {
				isCompiling = true;
				console.log("Remove", filePath);
				compiler.removeFile(filePath);
				await update(filePath);
				isCompiling = false;
			}
		});

	const pkgLockJsonPath = path.resolve("package-lock.json");
	if (fs.existsSync(pkgLockJsonPath)) {
		chokidar.watch(pkgLockJsonPath).on("change", async (filePath: string) => {
			console.log("Modules updated, copying..");
			await compiler.copyModules();
			await compiler.copyIncludes(noInclude);
		});
	}

	console.log("Running in watch mode..");
	console.log("Starting initial compile..");
	time(() => {
		compiler.compileAll(noInclude);
	});
} else {
	(async () => {
		try {
			await compiler.compileAll(noInclude);
		} catch (e) {
			process.exit(1);
		}
	})();
}
