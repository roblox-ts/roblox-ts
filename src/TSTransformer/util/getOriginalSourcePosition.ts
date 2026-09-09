import { originalPositionFor } from "@jridgewell/trace-mapping";
import type { SourcePosition } from "@roblox-ts/luau-ast";
import path from "path";
import type { MultiTransformState } from "TSTransformer/classes/MultiTransformState";
import type ts from "typescript";

function normalizeSourcePath(source: string): string {
	let stripped = source;
	if (stripped.startsWith("file:///")) {
		stripped = stripped.slice("file:///".length);
		// file:///home/... → /home/... (Unix needs the leading slash restored)
		// file:///D:/...   → D:/...   (Windows drive letter, no slash needed)
		if (!/^[a-zA-Z]:/.test(stripped)) {
			stripped = "/" + stripped;
		}
	}
	return path.normalize(stripped);
}

// plugin reprints need a second mapping step back to the original TypeScript
export function getOriginalSourcePosition(
	multiTransformState: MultiTransformState,
	node: ts.Node,
	positionSelector?: (node: ts.Node) => number,
): SourcePosition | undefined {
	const sourceFile = node.getSourceFile();
	const sourceOffset = positionSelector ? positionSelector(node) : node.getStart();
	const sourcePosition = sourceFile.getLineAndCharacterOfPosition(sourceOffset);

	const traceMap = multiTransformState.reprintTraceMaps.get(sourceFile.fileName);
	if (!traceMap) {
		return { line: sourcePosition.line, column: sourcePosition.character };
	}

	// trace-mapping uses 1-indexed lines
	const mapped = originalPositionFor(traceMap, { line: sourcePosition.line + 1, column: sourcePosition.character });

	if (mapped.line === null || mapped.source === null) {
		return undefined;
	}

	// the trace map source may use file:/// URIs or different separators
	if (normalizeSourcePath(mapped.source) !== path.normalize(sourceFile.fileName)) {
		return undefined;
	}

	return { line: mapped.line - 1, column: mapped.column ?? 0 };
}
