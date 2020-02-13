import fs from "fs-extra";
import chokidar, { FSWatcher } from "chokidar";
import { CompilerError } from "./errors/CompilerError";
import { LoggableError } from "./errors/LoggableError";
import { ProjectError } from "./errors/ProjectError";
import { Project } from "./Project";
import { clearContextCache, cmd, shouldCompileFile } from "./utility/general";

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

interface WatchEvent {
	type: "change" | "add" | "unlink";
	itemPath: string;
}

async function time(callback: () => Promise<void>) {
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
	private watchEventQueue = new Array<WatchEvent>();
	private processing = false;
	private hasUpdateAllSucceeded = false;
	private watcher: FSWatcher | undefined = undefined;

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

		if (shouldCompileFile(this.project.project, filePath)) {
			console.log("Change detected, compiling...");
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
		} else {
			await this.project.copyFile(filePath);
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

	private async startProcessingQueue() {
		if (!this.processing) {
			this.processing = true;
			while (this.watchEventQueue.length > 0) {
				const event = this.watchEventQueue.shift()!;

				if (event.type === "change") {
					await this.update(event.itemPath);
				} else if (event.type === "add") {
					if ((await fs.lstat(event.itemPath)).isSymbolicLink()) {
						// Chokidar internal problems requires us to restart the watcher
						this.start(true);
					}
					await this.update(event.itemPath);
				} else if (event.type === "unlink") {
					await this.project.removeFile(event.itemPath);
				}
			}
			this.processing = false;
		}
	}

	private pushToQueue(event: WatchEvent) {
		this.watchEventQueue.push(event);
		void this.startProcessingQueue();
	}

	public start(noInitialCompileLogs?: boolean) {
		if (this.watcher) {
			void this.watcher.close();
		}

		this.watcher = chokidar
			.watch(this.project.rootPath, CHOKIDAR_OPTIONS)
			.on("addDir", itemPath => this.pushToQueue({ type: "add", itemPath }))
			.on("unlinkDir", itemPath => this.pushToQueue({ type: "unlink", itemPath }))
			.on("change", itemPath => this.pushToQueue({ type: "change", itemPath }))
			.on("add", itemPath => this.pushToQueue({ type: "add", itemPath }))
			.on("unlink", itemPath => this.pushToQueue({ type: "unlink", itemPath }));

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

		if (!noInitialCompileLogs) {
			console.log("Running in watch mode..");
			console.log("Starting initial compile..");
		}
		void this.updateAll();
	}
}
