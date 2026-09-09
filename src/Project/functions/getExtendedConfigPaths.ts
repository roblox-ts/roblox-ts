import path from "path";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import ts from "typescript";

export function getExtendedConfigPaths(configPath: string, extended: string | Array<string> | undefined) {
	const paths = new Array<string>();
	for (const value of typeof extended === "string" ? [extended] : (extended ?? [])) {
		const normalized = ts.normalizeSlashes(value);
		let resolved: string | undefined;
		if (ts.isRootedDiskPath(normalized) || normalized.startsWith("./") || normalized.startsWith("../")) {
			resolved = ts.getNormalizedAbsolutePath(normalized, path.dirname(configPath));
			if (!ts.sys.fileExists(resolved) && !resolved.endsWith(".json")) {
				resolved += ".json";
			}
		} else {
			resolved = ts.nodeNextJsonConfigResolver(normalized, configPath, ts.sys).resolvedModule?.resolvedFileName;
		}

		if (resolved === undefined || !ts.sys.fileExists(resolved)) {
			throw new DiagnosticError([ts.createCompilerDiagnostic(ts.Diagnostics.File_0_not_found, value)]);
		}
		paths.push(path.normalize(resolved));
	}
	return paths;
}
