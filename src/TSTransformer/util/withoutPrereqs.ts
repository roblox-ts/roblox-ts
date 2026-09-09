import { Prereqs } from "TSTransformer/classes/Prereqs";
import { TransformState } from "TSTransformer/classes/TransformState";
import ts from "typescript";

// adapt transforms that cannot emit caller prerequisites to the dispatch signature
// while preserving their node types for syntax-kind validation
export function withoutPrereqs<T extends ts.Node, U>(transform: (state: TransformState, node: T) => U) {
	return (state: TransformState, prereqs: Prereqs, node: T) => transform(state, node);
}
