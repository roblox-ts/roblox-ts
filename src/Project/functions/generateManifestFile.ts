/* eslint-disable @typescript-eslint/no-explicit-any */
import { RojoResolver } from "@roblox-ts/rojo-resolver";
import fs from "fs-extra";
import path from "path";
import { NODE_MODULES } from "Shared/constants";
import { ProjectData } from "Shared/types";
import ts from "typescript";

type Manifest = { [index: string]: Manifest | string };

function generateNodeModulesManifest(fsPath: string, rojoResolver: RojoResolver) {
	const result: Manifest = {};

	for (const scopeName of fs.readdirSync(fsPath)) {
		if (scopeName.startsWith("@")) {
			result[scopeName] = generateScopeManifest(path.join(fsPath, scopeName), rojoResolver);
		}
	}

	return result;
}

function generatePackageManifest(fsPath: string, rojoResolver: RojoResolver) {
	const result: Manifest = {};

	const nodeModulesPath = path.join(fsPath, NODE_MODULES);
	if (fs.existsSync(nodeModulesPath)) {
		result[NODE_MODULES] = generateNodeModulesManifest(nodeModulesPath, rojoResolver);
	}

	result._rbxPath = rojoResolver.getRbxPathFromFilePath(fsPath)!.join(">");

	return result;
}

function generateScopeManifest(fsPath: string, rojoResolver: RojoResolver) {
	const result: Manifest = {};

	for (const pkgName of fs.readdirSync(fsPath)) {
		result[pkgName] = generatePackageManifest(path.join(fsPath, pkgName), rojoResolver);
	}

	return result;
}

export function generateManifestFile(
	data: ProjectData,
	compilerOptions: ts.CompilerOptions,
	rojoResolver: RojoResolver,
) {
	const result: Manifest = {};
	result.node_modules = {};

	for (const typeRoot of compilerOptions.typeRoots ?? []) {
		const scopePath = path.normalize(typeRoot);
		if (scopePath.startsWith(data.nodeModulesPath)) {
			const scopeName = path.basename(scopePath);
			result.node_modules[scopeName] = generateScopeManifest(scopePath, rojoResolver);
		}
	}

	fs.writeFileSync(
		path.join(data.includePath, "manifest.json"),
		JSON.stringify(result, undefined, (globalThis as any).RBXTSC_DEV ? 4 : undefined),
	);
}
