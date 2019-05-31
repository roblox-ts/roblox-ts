#!/usr/bin/env node

import chokidar from "chokidar";
import spawn from "cross-spawn";
import fs from "fs";
import path from "path";
import yargs from "yargs";
import { CompilerError } from "./errors/CompilerError";
import { ProjectError } from "./errors/ProjectError";
import { Project } from "./Project";
import { clearContextCache } from "./utility";

// cli interface
const argv = yargs
	.usage("Usage: rbxtsc [options]")

	// version
	.alias("v", "version")
	.version(require("../package.json").version as string)
	.describe("version", "show version information")

	// help
	.alias("h", "help")
	.help("help")
	.describe("help", "show help information")
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

	// noInclude
	.option("noInclude", {
		default: false,
		describe: "do not copy runtime files",
	})

	// includePath
	.option("i", {
		alias: "includePath",
		default: "include",
		describe: "folder to copy runtime files to",
	})

	// modulesPath
	.option("m", {
		alias: "modulesPath",
		default: "modules",
		describe: "folder to copy modules to",
	})

	// minify
	.option("minify", {
		alias: "min",
		default: false,
		describe: "minify emitted Lua code",
	})

	// onSuccess
	.option("onSuccess", {
		default: "",
		describe: "Command to run on watch success",
	})

	// rojo
	.option("rojo", {
		alias: "r",
		default: "",
		describe: "Manually select Rojo configuration file",
	})

	// parse
	.parse();

const project = new Project(argv);
if (argv.watch === true) {
	const rootDir = project.getRootDirOrThrow();
	let isCompiling = false;

	const onSuccessCommand: string = argv.onSuccess;
	async function onSuccess() {
		if (onSuccessCommand.length > 0) {
			const parts = onSuccessCommand.split(/\s+/);
			await spawn(parts.shift()!, parts, { stdio: "inherit" });
		}
	}

	const time = async (callback: () => any) => {
		const start = Date.now();
		try {
			await callback();
		} catch (e) {
			if (e instanceof ProjectError || e instanceof CompilerError) {
				process.exitCode = 0;
			} else {
				throw e;
			}
		}
		console.log(`Done, took ${Date.now() - start} ms!`);
	};

	const update = async (filePath: string) => {
		console.log("Change detected, compiling..");
		await project.refresh();
		clearContextCache();
		await time(async () => {
			try {
				await project.compileFileByPath(filePath);
			} catch (e) {
				console.log(e);
				process.exit();
			}
		});
		if (process.exitCode === 0) {
			await onSuccess();
		}
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
			if (!isCompiling) {
				isCompiling = true;
				await update(filePath);
				isCompiling = false;
			}
		})
		.on("add", async (filePath: string) => {
			if (!isCompiling) {
				isCompiling = true;
				console.log("Add", filePath);
				project.addFile(filePath);
				await update(filePath);
				isCompiling = false;
			}
		})
		.on("unlink", async (filePath: string) => {
			if (!isCompiling) {
				isCompiling = true;
				console.log("remove", filePath);
				await project.removeFile(filePath);
				isCompiling = false;
			}
		});

	const pkgLockJsonPath = path.resolve("package-lock.json");
	if (fs.existsSync(pkgLockJsonPath)) {
		chokidar.watch(pkgLockJsonPath).on("change", async (filePath: string) => {
			console.log("Modules updated, copying..");
			await project.copyModuleFiles();
		});
	}

	console.log("Running in watch mode..");
	console.log("Starting initial compile..");
	time(async () => {
		try {
			await project.compileAll();
		} catch (e) {
			console.log(e);
			process.exit();
		}
		if (process.exitCode === 0) {
			await onSuccess();
		}
	});
} else {
	project.compileAll();
}
