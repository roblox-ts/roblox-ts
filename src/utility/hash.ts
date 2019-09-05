import crypto from "crypto";
import fs from "fs-extra";
import readline from "readline";
import * as ts from "ts-morph";
import { COMPILER_VERSION } from "./general";

export function getHashForFile(file: ts.SourceFile) {
	const data = COMPILER_VERSION + "\n" + file.getFullText();
	return crypto
		.createHash("sha1")
		.update(data)
		.digest("hex");
}

export const HASH_PREFIX = "-- Hash: ";

function getFirstNLines(filePath: string, amtLines: number): Promise<Array<string>> {
	return new Promise<Array<string>>((resolve, reject) => {
		const rl = readline.createInterface({
			crlfDelay: Infinity,
			input: fs.createReadStream(filePath),
		});

		const result = new Array<string>();

		rl.on("line", line => {
			result.push(line);
			if (result.length >= amtLines) {
				rl.close();
				resolve(result);
			}
		});
	});
}

export async function checkFileHash(filePath: string, testHash: string) {
	if (await fs.pathExists(filePath)) {
		try {
			for (const line of await getFirstNLines(filePath, 3)) {
				if (line && line.startsWith(HASH_PREFIX)) {
					return line.slice(HASH_PREFIX.length).trim() === testHash;
				}
			}
		} catch (e) {}
	}
	return false;
}
