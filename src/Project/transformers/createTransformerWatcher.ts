import { TransformerWatcher } from "Shared/types";
import { assert } from "Shared/util/assert";
import { getCanonicalFileName } from "Shared/util/getCanonicalFileName";
import ts from "typescript";

function createServiceHost(program: ts.Program) {
	assert(ts.sys.createHash);
	const createHash = ts.sys.createHash;

	const rootFileNames = program.getRootFileNames().map(x => x);
	const files = new Map<string, number>();

	rootFileNames.forEach(fileName => {
		files.set(getCanonicalFileName(fileName), 0);
	});

	const overriddenText = new Map<string, string>();
	const versions = new Map<string, string>();
	const diskContents = new Map<string, string | undefined>();

	function updateProgram(nextProgram: ts.Program) {
		program = nextProgram;
		versions.clear();
		diskContents.clear();
	}

	function updateFile(fileName: string, text: string) {
		const key = getCanonicalFileName(fileName);
		overriddenText.set(key, text);

		const currentVersion = files.get(key) ?? 0;
		files.set(key, currentVersion + 1);
	}

	const serviceHost: ts.LanguageServiceHost = {
		getScriptFileNames: () => rootFileNames.filter(fileName => program.getSourceFile(fileName) !== undefined),
		getCurrentDirectory: () => process.cwd(),
		getCompilationSettings: () => program.getCompilerOptions(),
		getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
		fileExists: ts.sys.fileExists,
		readDirectory: ts.sys.readDirectory,
		directoryExists: ts.sys.directoryExists,
		getDirectories: ts.sys.getDirectories,
		realpath: ts.sys.realpath,
		useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
		getScriptVersion,
		getScriptSnapshot,
		readFile,
		getProjectReferences: () => program.getProjectReferences(),
	};

	function getScriptVersion(fileName: string) {
		const key = getCanonicalFileName(fileName);
		if (overriddenText.has(key)) {
			return `transformed:${files.get(key)}`;
		}

		let version = versions.get(key);
		if (version === undefined) {
			// the builder already read and versioned its inputs, including rewritten declarations
			version = program.getSourceFile(fileName)?.version ?? createHash(readFile(fileName) ?? "");
			versions.set(key, version);
		}
		return version;
	}

	function getScriptSnapshot(fileName: string) {
		const content = readFile(fileName);
		if (content === undefined) {
			return;
		}

		return ts.ScriptSnapshot.fromString(content);
	}

	function readFile(fileName: string, encoding?: string) {
		const key = getCanonicalFileName(fileName);
		const content = overriddenText.get(key) ?? program.getSourceFile(fileName)?.text;
		if (content !== undefined) {
			return content;
		}

		// a plugin can introduce imports absent from the builder's program
		if (!diskContents.has(key)) {
			diskContents.set(key, ts.sys.readFile(fileName, encoding));
		}
		return diskContents.get(key);
	}

	return { serviceHost, updateFile, updateProgram };
}

export function createTransformerWatcher(program: ts.Program): TransformerWatcher {
	const { serviceHost, updateFile, updateProgram } = createServiceHost(program);
	const service = ts.createLanguageService(serviceHost, ts.createDocumentRegistry(ts.sys.useCaseSensitiveFileNames));

	return { service, updateFile, updateProgram };
}
