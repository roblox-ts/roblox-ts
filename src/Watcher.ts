import chokidar from "chokidar";
import fs from "fs";
import path from "path";
import { CompilerError } from "./errors/CompilerError";
import { LoggableError } from "./errors/LoggableError";
import { ProjectError } from "./errors/ProjectError";
import { Project } from "./Project";
import { clearContextCache, cmd } from "./utility/general";

const CHOKIDAR_OPTIONS: chokidar.WatchOptions = {
	awaitWriteFinish: {
		pollInterval: 10,
		stabilityThreshold: 50,
	},
	ignoreInitial: true,
	ignorePermissionErrors: true,
	interval: 100,
	usePolling: true,
};

async function time(callback: () => any) {
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
}

export class Watcher {
	private isCompiling = false;
	private hasUpdateAllSucceeded = false;

	constructor(private project: Project, private onSuccessCmd = "") {}

	private async onSuccess() {
		if (this.onSuccessCmd.length > 0) {
			const parts = this.onSuccessCmd.split(/\s+/);
			const command = parts.shift();
			if (command) {
				await cmd(command, parts);
			}
		}
	}

	private async update(filePath: string) {
		if (!this.hasUpdateAllSucceeded) {
			await this.updateAll();
			return;
		}

		const ext = path.extname(filePath);
		if (ext === ".ts" || ext === ".tsx" || ext === ".lua") {
			console.log("Change detected, compiling..");
			try {
				await this.project.refreshFile(filePath);
			} catch (e) {
				if (e instanceof LoggableError) {
					e.log("");
					return;
				} else {
					throw e;
				}
			}
			clearContextCache();
			await time(async () => {
				try {
					await this.project.compileFileByPath(filePath, true);
				} catch (e) {
					console.log(e);
					process.exit();
				}
			});
			if (process.exitCode === 0) {
				await this.onSuccess();
			}
		}
	}

	private async updateAll() {
		await time(async () => {
			try {
				await this.project.compileAll();
				this.hasUpdateAllSucceeded = true;
			} catch (e) {
				console.log(e);
				process.exit();
			}
		});
		if (process.exitCode === 0) {
			await this.onSuccess();
		}
	}

	public start() {
		chokidar
			.watch(this.project.getRootDirOrThrow(), CHOKIDAR_OPTIONS)
			.on("change", async (filePath: string) => {
				if (!this.isCompiling) {
					this.isCompiling = true;
					await this.update(filePath);
					this.isCompiling = false;
				}
			})
			.on("add", async (filePath: string) => {
				if (!this.isCompiling) {
					this.isCompiling = true;
					await this.project.addFile(filePath);
					await this.update(filePath);
					this.isCompiling = false;
				}
			})
			.on("unlink", async (filePath: string) => {
				if (!this.isCompiling) {
					this.isCompiling = true;
					await this.project.removeFile(filePath);
					this.isCompiling = false;
				}
			});

		if (this.project.configFilePath) {
			chokidar.watch(this.project.configFilePath, CHOKIDAR_OPTIONS).on("change", async () => {
				console.log("tsconfig.json changed! Recompiling project..");
				this.project.reloadProject();
				await this.updateAll();
			});
		}

		if (this.project.rojoFilePath) {
			chokidar.watch(this.project.rojoFilePath, CHOKIDAR_OPTIONS).on("change", async () => {
				console.log("Rojo configuration changed! Recompiling project..");
				this.project.reloadRojo();
				await this.updateAll();
			});
		}

		const pkgLockJsonPath = path.resolve("package-lock.json");
		if (fs.existsSync(pkgLockJsonPath)) {
			chokidar.watch(pkgLockJsonPath, CHOKIDAR_OPTIONS).on("change", async () => {
				console.log("Modules updated, copying..");
				await this.project.copyModuleFiles();
			});
		}

		console.log("Running in watch mode..");
		console.log("Starting initial compile..");
		void this.updateAll();
	}
}
