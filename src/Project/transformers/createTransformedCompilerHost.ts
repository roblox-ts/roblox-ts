import ts from "byots";

export function createTransformedCompilerHost(
	options: ts.CompilerOptions,
	sourceFiles: Array<ts.SourceFile>,
	transformResult: ts.TransformationResult<ts.SourceFile | ts.Bundle>,
): ts.CompilerHost {
	const sourceFileMap = new Map<string, { original: ts.SourceFile; transformed: ts.SourceFile; cache?: string }>();

	sourceFiles.forEach((original, i) => {
		const transformed = transformResult.transformed[i] as ts.SourceFile;
		sourceFileMap.set(original.fileName, { original, transformed });
	});

	const printer = ts.createPrinter();

	const host = ts.createCompilerHost(options, true);

	host.readFile = file => {
		const map = sourceFileMap.get(file);
		if (map && map.original !== map.transformed) {
			return (map.cache ??= printer.printFile(map.transformed));
		}
		return ts.sys.readFile(file);
	};

	const origGetSourceFile = host.getSourceFile.bind(host);
	host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
		const original = origGetSourceFile(fileName, languageVersion, onError, shouldCreate);
		if (original) {
			original.version = sourceFileMap.get(fileName)?.original.version ?? "0.0.0";
		}
		return original;
	};

	return host;
}
