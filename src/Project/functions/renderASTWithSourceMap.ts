import { addMapping, GenMapping, setSourceContent, toEncodedMap } from "@jridgewell/gen-mapping";
import luau, { GeneratedPosition, renderASTWithPositions, SourcePosition } from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";

interface SourceMapping {
	generated: GeneratedPosition;
	original: SourcePosition;
	priority: number;
}

function collectMappings(ast: luau.List<luau.Statement>): { code: string; mappings: Array<SourceMapping> } {
	const { code, positions } = renderASTWithPositions(ast);
	const mappings = new Array<SourceMapping>();

	for (const { node, range } of positions) {
		if (!node.origin) {
			continue;
		}

		if (luau.isStatement(node)) {
			assert(range.start.column === 0);
			mappings.push({ generated: range.start, original: node.origin.start, priority: 1 });
		}

		if (range.closing && node.origin.closing) {
			mappings.push({
				generated: { line: range.closing.line, column: 0 },
				original: node.origin.closing,
				priority: 0,
			});
		}
	}

	mappings.sort(
		(a, b) =>
			a.generated.line - b.generated.line || a.generated.column - b.generated.column || a.priority - b.priority,
	);

	const selectedMappings = mappings.filter((mapping, index) => {
		const next = mappings[index + 1];
		return (
			next === undefined ||
			mapping.generated.line !== next.generated.line ||
			mapping.generated.column !== next.generated.column
		);
	});

	return { code, mappings: selectedMappings };
}

export function renderASTWithSourceMap(
	ast: luau.List<luau.Statement>,
	sourceFileName: string,
	outputFileName: string,
	sourceContent: string,
) {
	const { code, mappings } = collectMappings(ast);
	const map = new GenMapping({ file: outputFileName });

	setSourceContent(map, sourceFileName, sourceContent);

	for (const mapping of mappings) {
		addMapping(map, {
			generated: { line: mapping.generated.line + 1, column: mapping.generated.column },
			source: sourceFileName,
			original: { line: mapping.original.line + 1, column: mapping.original.column },
		});
	}

	return { code, map: toEncodedMap(map) };
}
