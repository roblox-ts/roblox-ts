import ts from "typescript";

/**
 * Returns the label names stacked directly on a statement, innermost first.
 *
 * e.g. for the loop in `a: b: for (...) {}` this returns `["b", "a"]`.
 */
export function getLabelsOfStatement(statement: ts.Node) {
	const labels = new Array<string>();
	for (let parent = statement.parent; parent && ts.isLabeledStatement(parent); parent = parent.parent) {
		labels.push(parent.label.text);
	}
	return labels;
}
