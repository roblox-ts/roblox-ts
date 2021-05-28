import ts from "byots";
import { TransformerWatcher } from "Shared/types";

function createServiceHost(program: ts.Program) {
	const rootFileNames = program.getRootFileNames().map(x => x);
	const files = new Map<string, number>();

	rootFileNames.forEach(fileName => {
		files.set(fileName, 0);
	});

	const overriddenText = new Map<string, string>();

	function updateFile(fileName: string, text: string) {
		overriddenText.set(fileName, text);

		const currentVersion = files.get(fileName) ?? 0;
		files.set(fileName, currentVersion + 1);
	}

	const serviceHost: ts.LanguageServiceHost = {
		getScriptFileNames: () => [...files.keys()].filter(ts.sys.fileExists),
		getCurrentDirectory: () => process.cwd(),
		getCompilationSettings: () => program.getCompilerOptions(),
		getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
		fileExists: ts.sys.fileExists,
		readDirectory: ts.sys.readDirectory,
		directoryExists: ts.sys.directoryExists,
		getDirectories: ts.sys.getDirectories,
		getScriptVersion,
		getScriptSnapshot,
		readFile,
	};

	function getScriptVersion(fileName: string) {
		const version = files.get(fileName)?.toString();
		return version ?? "0";
	}

	function getScriptSnapshot(fileName: string) {
		const content = readFile(fileName);
		if (content === undefined) return;

		return ts.ScriptSnapshot.fromString(content);
	}

	function readFile(fileName: string, encoding?: string) {
		const content = overriddenText.get(fileName);
		if (content !== undefined) return content;

		return ts.sys.readFile(fileName, encoding);
	}

	return { serviceHost, updateFile };
}

export function createTransformerWatcher(program: ts.Program): TransformerWatcher {
	const { serviceHost, updateFile } = createServiceHost(program);
	const service = ts.createLanguageService(serviceHost, ts.createDocumentRegistry());

	return { service, updateFile };
}
