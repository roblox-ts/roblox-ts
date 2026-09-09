import { TraceMap } from "@jridgewell/trace-mapping";
import ts from "typescript";

interface PrintResult {
	text: string;
	traceMap: TraceMap | undefined;
}

export function printSourceFileWithTraceMap(
	sourceFile: ts.SourceFile,
	compilerOptions: ts.CompilerOptions,
): PrintResult {
	const printer = ts.createPrinter({ removeComments: compilerOptions.removeComments });

	if (!compilerOptions.sourceMap) {
		return { text: printer.printFile(sourceFile), traceMap: undefined };
	}

	const writer = ts.createTextWriter("\n");
	const smGenerator = ts.createSourceMapGenerator(
		{ getCurrentDirectory: () => "", getCanonicalFileName: (f: string) => f } as ts.EmitHost,
		sourceFile.fileName,
		"",
		"",
		{},
	);

	printer.writeFile(sourceFile, writer, smGenerator);

	const text = writer.getText();
	const rawMap = smGenerator.toJSON();
	const traceMap = new TraceMap(rawMap as ConstructorParameters<typeof TraceMap>[0]);

	return { text, traceMap };
}
