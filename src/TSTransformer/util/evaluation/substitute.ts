import luau from "@roblox-ts/luau-ast";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { offset } from "TSTransformer/util/offset";

export function substitute<T extends luau.Node>(node: T, replacements: ReadonlyMap<number, luau.Expression>): T {
	if (luau.isTemporaryIdentifier(node)) {
		const replacement = replacements.get(node.id);
		if (replacement) {
			return { ...replacement, parent: undefined } as T;
		}
	}
	const fields: Record<string | symbol, unknown> = { ...node };
	delete fields.parent;
	for (const [key, value] of Object.entries(fields)) {
		if (luau.isNode(value)) {
			fields[key] = substitute(value, replacements);
		} else if (luau.list.isList(value)) {
			fields[key] = luau.list.make(...luau.list.toArray(value).map(child => substitute(child, replacements)));
		}
	}
	const updated = luau.create(node.kind, fields as never) as T;
	// substitution can turn an indexable reference into a call/literal/conditional
	if (luau.isPropertyAccessExpression(updated) || luau.isComputedIndexExpression(updated) || luau.isCall(updated)) {
		updated.expression = convertToIndexableExpression(updated.expression as luau.Expression);
	}
	// recover arithmetic folding which was intentionally hidden behind references
	if (
		luau.isBinaryExpression(updated) &&
		(updated.operator === "+" || updated.operator === "-") &&
		luau.isNumberLiteral(updated.right)
	) {
		return offset(updated.left, Number(updated.right.value) * (updated.operator === "-" ? -1 : 1)) as T;
	}
	return updated;
}
