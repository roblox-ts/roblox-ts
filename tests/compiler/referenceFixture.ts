import { spawn } from "child_process";
import { once } from "events";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { ProjectBuild } from "Project";
import { setupProjectWatchProgram } from "Project/functions/setupProjectWatchProgram";
import { PACKAGE_ROOT } from "Shared/constants";
import { ProjectOptions } from "Shared/types";
import { formatDiagnostics } from "Shared/util/formatDiagnostics";
import ts from "typescript";

export class ReferenceFixture {
	// Windows short paths from TEMP can crash libuv's native filesystem watcher
	public readonly directory = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "rbxts-references-")));
	private readonly projects = new Set<string>();
	private readonly builds = new Array<ProjectBuild>();

	constructor() {
		fs.copySync(path.join(PACKAGE_ROOT, "tests/node_modules"), this.file("node_modules"));

		this.json("package.json", { name: "reference-fixture", version: "1.0.0" });
		this.json("base.json", {
			compilerOptions: {
				allowSyntheticDefaultImports: true,
				module: "commonjs",
				moduleResolution: "Node",
				moduleDetection: "force",
				noLib: true,
				strict: true,
				target: "ESNext",
				incremental: true,
				skipLibCheck: true,
				typeRoots: ["node_modules/@rbxts"],
				types: ["compiler-types", "types"],
			},
		});
	}

	public file(relative: string) {
		return path.join(this.directory, relative);
	}

	public write(relative: string, text: string) {
		fs.outputFileSync(this.file(relative), text);
	}

	public json(relative: string, value: unknown) {
		fs.outputJsonSync(this.file(relative), value, { spaces: 2 });
	}

	public project(name: string, references: Array<string> = [], options: Record<string, unknown> = {}) {
		this.projects.add(name);
		this.json(`${name}/tsconfig.json`, {
			extends: "../base.json",
			compilerOptions: {
				rootDir: "src",
				outDir: `../out/${name}`,
				tsBuildInfoFile: `../cache/${name}.tsbuildinfo`,
				composite: name !== "game",
				...options,
			},
			include: ["src"],
			references: references.map(reference => ({ path: `../${reference}` })),
		});

		this.write(`${name}/src/index.ts`, "export const value = 1;");
		this.rojo();
	}

	public rojo(mappings: Record<string, unknown> = {}) {
		this.json("default.project.json", {
			name: "references",
			tree: {
				$className: "DataModel",
				ReplicatedStorage: {
					$className: "ReplicatedStorage",
					include: { $path: "include" },
					...Object.fromEntries([...this.projects].map(name => [name, { $path: `out/${name}` }])),
					...mappings,
				},
			},
		});
	}

	public read(relative: string) {
		return fs.readFileSync(this.file(relative), "utf8");
	}

	public options(): Partial<ProjectOptions> {
		return { rojo: this.file("default.project.json"), includePath: this.file("include"), writeOnlyChanged: true };
	}

	public createBuild(options: Partial<ProjectOptions> = {}, project = "game") {
		const build = new ProjectBuild(this.file(`${project}/tsconfig.json`), { ...this.options(), ...options });
		this.builds.push(build);

		return build;
	}

	public close() {
		for (const build of this.builds) {
			build.close();
		}

		fs.removeSync(this.directory);
	}
}

export function expectSuccess(result: ts.EmitResult) {
	if (result.emitSkipped || result.diagnostics.length > 0) {
		throw new Error(formatDiagnostics(result.diagnostics));
	}
}

export async function startWatch(fixture: ReferenceFixture, usePolling = false, mode: "project" | "cli" = "project") {
	let log = "";
	let count = 0;
	let lastOutput = 0;

	const read = (chunk: Buffer | string) => {
		log += chunk.toString();
		count = (log.match(/Watching for file changes\./g) ?? []).length;
		lastOutput = Date.now();
	};

	let child: ReturnType<typeof spawn> | undefined;
	let close: () => Promise<void>;
	if (mode === "project") {
		// running the real watcher in Jest includes config reloads and filesystem events in coverage
		const build = fixture.createBuild();
		const write = jest.spyOn(ts.sys, "write").mockImplementation(read);
		let watcher: ReturnType<typeof setupProjectWatchProgram>;
		try {
			watcher = setupProjectWatchProgram(build, usePolling);
		} catch (error) {
			write.mockRestore();
			throw error;
		}

		close = async () => {
			try {
				await watcher.close();
			} finally {
				write.mockRestore();
			}
		};
	} else {
		child = spawn(
			process.execPath,
			[
				path.join(PACKAGE_ROOT, "out/CLI/cli.js"),
				"-p",
				fixture.file("game"),
				"--rojo",
				fixture.file("default.project.json"),
				"--includePath",
				fixture.file("include"),
				"-w",
				...(usePolling ? ["--usePolling"] : []),
			],
			{ cwd: fixture.directory, stdio: ["ignore", "pipe", "pipe"] },
		);

		if (!child.stdout || !child.stderr) {
			throw new Error("Watch process must expose stdout and stderr");
		}

		child.stdout.on("data", read);
		child.stderr.on("data", read);
		const watchProcess = child;
		close = async () => {
			const closed = once(watchProcess, "close");
			watchProcess.kill();
			await closed;
		};
	}

	const exited = () => child !== undefined && child.exitCode !== null;

	const wait = (previous: number) =>
		new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => finish(new Error(`Watch did not finish:\n${log}`)), 30000);

			const interval = setInterval(() => {
				if (exited()) {
					finish(new Error(`Watch exited:\n${log}`));
				} else if (
					count > previous &&
					(log.match(/Starting (?:incremental )?compilation/g) ?? []).length === count &&
					Date.now() - lastOutput >= 500
				) {
					finish();
				}
			}, 20);

			function finish(error?: Error) {
				clearTimeout(timeout);
				clearInterval(interval);

				if (error) {
					reject(error);
				} else {
					resolve();
				}
			}
		});

	try {
		await wait(0);
	} catch (error) {
		await close();
		throw error;
	}

	return {
		async edit(action: () => void) {
			const previous = count;
			action();
			await wait(previous);
		},

		async expectNoBuild(action: () => void) {
			const previous = log.length;
			action();
			await new Promise(resolve => setTimeout(resolve, 1250));

			if (exited() || log.length !== previous) {
				throw new Error(`Expected watch to remain idle:\n${log}`);
			}
		},

		get log() {
			return log;
		},

		close,
	};
}
