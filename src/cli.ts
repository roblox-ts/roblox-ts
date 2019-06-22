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

const CHOKIDAR_OPTIONS = {
	awaitWriteFinish: {
		pollInterval: 10,
		stabilityThreshold: 50,
	},
	ignoreInitial: true,
	ignorePermissionErrors: true,
	interval: 100,
	usePolling: true,
};

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
		boolean: true,
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
		boolean: true,
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

	async function update(filePath: string) {
		const ext = path.extname(filePath);
		if (ext === ".ts" || ext === ".tsx" || ext === ".lua") {
			console.log("Change detected, compiling..");
			await project.refreshFile(filePath);
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
		}
	}

	async function updateAll() {
		await time(async () => {
			try {
				await project.compileAll();
			} catch (e) {
				console.log(e);
				process.exit();
			}
		});
		if (process.exitCode === 0) {
			await onSuccess();
		}
	}

	chokidar
		.watch(rootDir, CHOKIDAR_OPTIONS)
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
				project.addFile(filePath);
				await update(filePath);
				isCompiling = false;
			}
		})
		.on("unlink", async (filePath: string) => {
			if (!isCompiling) {
				isCompiling = true;
				await project.removeFile(filePath);
				isCompiling = false;
			}
		});

	if (project.configFilePath) {
		chokidar.watch(project.configFilePath, CHOKIDAR_OPTIONS).on("change", async () => {
			console.log("tsconfig.json changed! Recompiling project..");
			project.reloadProject();
			await updateAll();
		});
	}

	if (project.rojoFilePath) {
		chokidar.watch(project.rojoFilePath, CHOKIDAR_OPTIONS).on("change", async () => {
			console.log("Rojo configuration changed! Recompiling project..");
			project.reloadRojo();
			await updateAll();
		});
	}

	const pkgLockJsonPath = path.resolve("package-lock.json");
	if (fs.existsSync(pkgLockJsonPath)) {
		chokidar.watch(pkgLockJsonPath).on("change", async (filePath: string) => {
			console.log("Modules updated, copying..");
			await project.copyModuleFiles();
		});
	}

	console.log("Running in watch mode..");
	console.log("Starting initial compile..");
	updateAll();
} else {
	project.compileAll();
}
