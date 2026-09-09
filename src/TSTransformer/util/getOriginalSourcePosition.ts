import { originalPositionFor } from "@jridgewell/trace-mapping";
import path from "path";
import type { SourcePosition } from "Shared/types";
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
): SourcePosition {
	const sf = node.getSourceFile();
	const pos = positionSelector ? positionSelector(node) : node.getStart();
	const lc = sf.getLineAndCharacterOfPosition(pos);

	const traceMap = multiTransformState.reprintTraceMaps.get(sf.fileName);
	if (!traceMap) {
		return { line: lc.line, column: lc.character };
	}

	// trace-mapping uses 1-indexed lines
	const mapped = originalPositionFor(traceMap, { line: lc.line + 1, column: lc.character });

	if (mapped.line === null || mapped.source === null) {
		return { line: lc.line, column: lc.character };
	}

	// the trace map source may use file:/// URIs or different separators
	if (normalizeSourcePath(mapped.source) !== path.normalize(sf.fileName)) {
		return { line: lc.line, column: lc.character };
	}

	// convert back to 0-indexed
	return { line: mapped.line - 1, column: mapped.column ?? 0 };
}
