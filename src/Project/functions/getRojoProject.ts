import { RojoResolver } from "@roblox-ts/rojo-resolver";
import fs from "fs-extra";
import path from "path";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { createTextDiagnostic } from "Shared/util/createTextDiagnostic";

export function getRojoProject(configPath: string) {
	const files = new Map<string, string>();
	const directories = new Set<string>();
	const visited = new Set<string>();

	// rojo-resolver does not expose its config dependencies, so follow its directory discovery rules
	const visitDirectory = (directory: string) => {
		directories.add(directory);
		if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
			return;
		}

		const realPath = fs.realpathSync(directory);
		if (visited.has(realPath)) {
			return;
		}
		visited.add(realPath);

		const children = fs.readdirSync(directory, { withFileTypes: true });
		if (children.some(child => child.name === "default.project.json")) {
			visitConfig(path.join(directory, "default.project.json"));
			return;
		}

		for (const entry of children) {
			const child = path.join(directory, entry.name);
			if (entry.isDirectory() || (entry.isSymbolicLink() && fs.statSync(child).isDirectory())) {
				visitDirectory(child);
			} else if (/^.+\.project\.json$/.test(entry.name)) {
				visitConfig(child);
			}
		}
	};

	const visitTree = (basePath: string, tree: unknown) => {
		if (tree === null || typeof tree !== "object") {
			return;
		}

		for (const [key, value] of Object.entries(tree)) {
			if (key === "$path") {
				const directory = typeof value === "string" ? value : value?.optional;
				if (typeof directory === "string") {
					const resolved = path.resolve(basePath, directory);
					// explicit module files are leaves, including JSON files
					if (!/\.(?:lua|luau|json|toml)$/.test(resolved)) {
						visitDirectory(resolved);
					}
				}
			} else if (!key.startsWith("$")) {
				visitTree(basePath, value);
			}
		}
	};

	const visitConfig = (filePath: string) => {
		if (files.has(filePath)) {
			return;
		}
		const contents = fs.readFileSync(filePath, "utf8");
		files.set(filePath, contents);
		const config = JSON.parse(contents);
		visitTree(path.dirname(filePath), config?.tree);
	};

	try {
		visitConfig(configPath);
		return {
			rojoResolver: RojoResolver.fromPath(configPath),
			rojoConfigFiles: files,
			rojoConfigDirectories: [...directories],
		};
	} catch (error) {
		throw new DiagnosticError([
			createTextDiagnostic(`Unable to read Rojo project "${configPath}": ${String(error)}`),
		]);
	}
}
