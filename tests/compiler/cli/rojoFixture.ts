import { spawnSync } from "child_process";
import fs from "fs-extra";
import path from "path";
import { PACKAGE_ROOT } from "Shared/constants";
import ts from "typescript";

import { ReferenceFixture } from "../referenceFixture";

export class RojoFixture extends ReferenceFixture {
	constructor() {
		super();
		this.project("game");
		// subprocesses launched from the fixture must use the repository's pinned Rojo version
		fs.copyFileSync(path.join(PACKAGE_ROOT, "foreman.toml"), this.file("foreman.toml"));
		this.write("out/game/init.luau", "return {}\n");
		this.tree({
			$className: "DataModel",
			ReplicatedStorage: {
				$className: "ReplicatedStorage",
				Main: { $path: "../out/game" },
			},
		});
	}

	public tree(tree: Record<string, unknown>, file = "game/default.project.json") {
		this.json(file, { name: "rojo-fixture", tree });
	}

	public diagnostics() {
		const configPath = this.file("game/tsconfig.json");
		const config = ts.readConfigFile(configPath, ts.sys.readFile);
		const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath), {
			skipLibCheck: false,
		});
		const program = ts.createProgram(parsed.fileNames, parsed.options);
		return ts
			.getPreEmitDiagnostics(program)
			.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
	}

	public run(args: Array<string>, cwd = this.directory, env = process.env) {
		const result = spawnSync(process.execPath, [path.join(PACKAGE_ROOT, "out/CLI/cli.js"), ...args], {
			cwd,
			env,
			encoding: "utf8",
			timeout: 20000,
		});
		if (result.error) {
			throw result.error;
		}
		expect(result.signal).toBeNull();
		return result;
	}
}
