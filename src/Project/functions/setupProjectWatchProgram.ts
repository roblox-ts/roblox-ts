import chokidar from "chokidar";
import fs from "fs-extra";
import path from "path";
import { ProjectBuild } from "Project/classes/ProjectBuild";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { isPathDescendantOf } from "Shared/util/isPathDescendantOf";
import ts from "typescript";

export function setupProjectWatchProgram(build: ProjectBuild, usePolling: boolean) {
	const diagnosticReporter = ts.createDiagnosticReporter(ts.sys, true);
	const watchReporter = ts.createWatchStatusReporter(ts.sys, true);

	const reportText = (messageText: string) =>
		watchReporter(
			{
				category: ts.DiagnosticCategory.Message,
				code: 0,
				messageText,
				file: undefined,
				start: undefined,
				length: undefined,
			},
			ts.sys.newLine,
			build.graph.root.config.options,
		);

	const pending = new Set<string>();
	let timeout: NodeJS.Timeout | undefined;
	let ready = false;
	let closed = false;

	let activePaths = build.getWatchPaths();
	const subscribedPaths = new Set(activePaths);
	const missingPaths = new Map<string, () => void>();
	const overlapsActivePath = (filePath: string) =>
		activePaths.some(active => isPathDescendantOf(filePath, active) || isPathDescendantOf(active, filePath));

	const watcher = chokidar.watch(activePaths, {
		// newly subscribed paths need add events to catch edits made while their watchers were being registered
		ignoreInitial: false,
		usePolling,
		awaitWriteFinish: { pollInterval: 10, stabilityThreshold: 50 },
		ignored: (filePath, stats) => {
			if (build.isConfigPath(filePath)) {
				return false;
			}
			if (build.isOutputPath(filePath) || ["node_modules", ".git"].includes(path.basename(filePath))) {
				return !((!stats || stats.isDirectory()) && build.isRojoConfigDirectory(filePath));
			}
			// mapped directories are watched for project files, without subscribing to their unrelated assets
			return Boolean(
				stats?.isFile() && build.isRojoConfigDirectory(filePath) && !build.isSourceInputPath(filePath),
			);
		},
	});

	const updateMissingPaths = () => {
		const missing = new Set(activePaths.filter(filePath => !fs.existsSync(filePath)));
		for (const [filePath, close] of missingPaths) {
			if (!missing.has(filePath)) {
				close();
				missingPaths.delete(filePath);
			}
		}
		for (const filePath of missing) {
			if (!missingPaths.has(filePath)) {
				// chokidar can miss file creation when multiple parent directories are also missing
				const listener = (current: fs.Stats) => {
					if (current.nlink > 0) {
						collect(filePath);
					}
				};
				fs.watchFile(filePath, { interval: 250 }, listener);
				missingPaths.set(filePath, () => fs.unwatchFile(filePath, listener));
			}
		}
	};

	const compile = (initial = false) => {
		timeout = undefined;

		const paths = [...pending];
		pending.clear();

		reportText(
			initial
				? "Starting compilation in watch mode..."
				: "File change detected. Starting incremental compilation...",
		);

		let diagnostics: ReadonlyArray<ts.Diagnostic>;
		try {
			diagnostics = build.build(initial ? undefined : paths).diagnostics;
		} catch (error) {
			if (!(error instanceof DiagnosticError)) {
				throw error;
			}

			diagnostics = error.diagnostics;
		}

		activePaths = build.getWatchPaths();
		// unwatching an ancestor also ignores its children, which may still belong to the active graph
		const removedPaths = [...subscribedPaths].filter(filePath => !overlapsActivePath(filePath));
		watcher.unwatch(removedPaths);
		for (const filePath of removedPaths) {
			subscribedPaths.delete(filePath);
		}

		watcher.add(activePaths);
		for (const filePath of activePaths) {
			subscribedPaths.add(filePath);
		}
		updateMissingPaths();

		for (const diagnostic of diagnostics) {
			diagnosticReporter(diagnostic);
		}

		const errors = diagnostics.filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error).length;

		reportText(`Found ${errors} error${errors === 1 ? "" : "s"}. Watching for file changes.`);
	};

	const collect = (filePath: string) => {
		if (closed || !overlapsActivePath(filePath)) {
			return;
		}

		pending.add(filePath);
		if (!ready) {
			return;
		}

		if (timeout) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(compile, 100);
	};

	watcher
		.on("add", collect)
		.on("addDir", collect)
		.on("change", collect)
		.on("unlink", collect)
		.on("unlinkDir", collect)
		.once("ready", () => {
			ready = true;
			compile(true);
		});

	return {
		async close() {
			closed = true;
			if (timeout) {
				clearTimeout(timeout);
			}
			for (const close of missingPaths.values()) {
				close();
			}
			missingPaths.clear();
			await watcher.close();
			build.close();
		},
	};
}
