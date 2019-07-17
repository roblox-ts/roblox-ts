import chokidar from "chokidar";
import spawn from "cross-spawn";
import fs from "fs";
import path from "path";
import { CompilerError } from "./errors/CompilerError";
import { ProjectError } from "./errors/ProjectError";
import { Project } from "./Project";
import { clearContextCache } from "./utility";

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

export class Watcher {
	constructor(private project: Project, private onSuccess = "") {}

	public start() {
		const project = this.project;

		const rootDir = project.getRootDirOrThrow();
		let isCompiling = false;

		const onSuccessCommand = this.onSuccess;
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
					await project.addFile(filePath);
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
			chokidar.watch(pkgLockJsonPath, CHOKIDAR_OPTIONS).on("change", async (filePath: string) => {
				console.log("Modules updated, copying..");
				await project.copyModuleFiles();
			});
		}

		console.log("Running in watch mode..");
		console.log("Starting initial compile..");
		void updateAll();
	}
}
