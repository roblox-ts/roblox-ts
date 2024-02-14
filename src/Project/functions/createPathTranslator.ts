import { PathTranslator } from "@roblox-ts/path-translator";
import path from "path";
import { findAncestorDir } from "Shared/util/findAncestorDir";
import { getRootDirs } from "Shared/util/getRootDirs";
import ts from "typescript";

export function createPathTranslator(program: ts.BuilderProgram) {
	const compilerOptions = program.getCompilerOptions();
	const rootDir = findAncestorDir([program.getProgram().getCommonSourceDirectory(), ...getRootDirs(compilerOptions)]);
	const outDir = compilerOptions.outDir!;
	let buildInfoPath = ts.getTsBuildInfoEmitOutputFilePath(compilerOptions);
	if (buildInfoPath !== undefined) {
		buildInfoPath = path.normalize(buildInfoPath);
	}
	const declaration = compilerOptions.declaration === true;
	return new PathTranslator(rootDir, outDir, buildInfoPath, declaration);
}
