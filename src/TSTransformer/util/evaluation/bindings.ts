import { TransformState } from "TSTransformer";
import { BindingKey } from "TSTransformer/util/evaluation/facts";
import { getAncestor } from "TSTransformer/util/traversal";
import ts from "typescript";

function enclosingFunction(node: ts.Node) {
	return getAncestor(node.parent, ts.isFunctionLike);
}

export interface BindingUsage {
	readonly captured: ReadonlySet<ts.Symbol>;
	readonly writtenByClosure: ReadonlySet<ts.Symbol>;
}

function getBindingUsage(state: TransformState, sourceFile: ts.SourceFile): BindingUsage {
	const cache = state.multiTransformState.bindingUsageBySourceFile;
	let usage = cache.get(sourceFile);
	if (!usage) {
		const captured = new Set<ts.Symbol>();
		const writtenByClosure = new Set<ts.Symbol>();
		function visit(node: ts.Node) {
			if (ts.isIdentifier(node)) {
				const symbol = ts.isShorthandPropertyAssignment(node.parent)
					? state.typeChecker.getShorthandAssignmentValueSymbol(node.parent)
					: state.typeChecker.getSymbolAtLocation(node);
				const declaration = symbol?.valueDeclaration;
				if (
					symbol &&
					declaration &&
					declaration.getSourceFile() === sourceFile &&
					enclosingFunction(declaration) !== enclosingFunction(node)
				) {
					captured.add(symbol);
					if (ts.isAssignmentTarget(node)) {
						writtenByClosure.add(symbol);
					}
				}
			}
			ts.forEachChild(node, visit);
		}
		visit(sourceFile);
		usage = { captured, writtenByClosure };
		cache.set(sourceFile, usage);
	}
	return usage;
}

// unknown callees can only rebind a local if some closure has access to it
export function getBindingKey(state: TransformState, symbol: ts.Symbol, reference: ts.Identifier): BindingKey {
	const cache = state.multiTransformState.bindingKeys;
	const existing = cache.get(symbol);
	if (existing) {
		return existing;
	}
	const sourceFile = reference.getSourceFile();
	const usage = getBindingUsage(state, sourceFile);
	const declaration = symbol.valueDeclaration;
	const external = !declaration || declaration.getSourceFile() !== sourceFile;
	const key = {
		captured: external || usage.captured.has(symbol),
		writtenByClosure: external || usage.writtenByClosure.has(symbol),
	};
	cache.set(symbol, key);
	return key;
}
