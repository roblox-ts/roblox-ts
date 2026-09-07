import { spawn } from "child_process";
import { once } from "events";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { ProjectBuild } from "Project/classes/ProjectBuild";
import { PACKAGE_ROOT } from "Shared/constants";
import { ProjectOptions } from "Shared/types";
import { formatDiagnostics } from "Shared/util/formatDiagnostics";
import ts from "typescript";

export class ReferenceFixture {
	public readonly directory = fs.mkdtempSync(path.join(os.tmpdir(), "rbxts-references-"));
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

export async function startWatch(fixture: ReferenceFixture, usePolling = false) {
	const child = spawn(
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

	let log = "";
	let count = 0;
	let lastOutput = 0;

	const read = (chunk: Buffer) => {
		log += chunk.toString();
		count = (log.match(/Watching for file changes\./g) ?? []).length;
		lastOutput = Date.now();
	};

	child.stdout.on("data", read);
	child.stderr.on("data", read);

	const wait = (previous: number) =>
		new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(
				() =>
					finish(
						new Error(
							`Watch did not finish (pid=${child.pid}, exec=${process.execPath}, script=${PACKAGE_ROOT}):\n${log}`,
						),
					),
				15000,
			);

			const interval = setInterval(() => {
				if (child.exitCode !== null) {
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
		child.kill();
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

			if (child.exitCode !== null || log.length !== previous) {
				throw new Error(`Expected watch to remain idle:\n${log}`);
			}
		},

		get log() {
			return log;
		},

		async close() {
			const closed = once(child, "close");
			child.kill();
			await closed;
		},
	};
}
