import luau from "LuauAST";

function kindToStr(syntaxKind: luau.SyntaxKind) {
	const result = luau.SyntaxKind[syntaxKind];
	if (result === "FirstIndexableExpression") return "Identifier";
	if (result === "LastIndexableExpression") return "ParenthesizedExpression";
	if (result === "FirstExpression") return "Identifier";
	if (result === "LastExpression") return "Set";
	if (result === "FirstStatement") return "Assignment";
	if (result === "LastStatement") return "Comment";
	if (result === "FirstField") return "MapField";
	if (result === "LastField") return "MapField";
	return result;
}

function visualizeNode(node: luau.Node) {
	if (luau.isIdentifier(node)) {
		return `id(${node.name})`;
	} else if (luau.isTemporaryIdentifier(node)) {
		return `id(TEMP)`;
	} else if (luau.isEmptyIdentifier(node)) {
		return `id(_)`;
	} else if (luau.isNumberLiteral(node) || luau.isStringLiteral(node)) {
		return node.value;
	} else if (luau.isNilLiteral(node)) {
		return null;
	} else if (luau.isTrueLiteral(node)) {
		return true;
	} else if (luau.isFalseLiteral(node)) {
		return false;
	}
}

export function visualizeAST(ast: luau.Node | luau.List<luau.Node>) {
	return JSON.stringify(
		ast,
		function(key, value) {
			if (luau.isNode(value)) {
				const result = visualizeNode(value);
				if (result !== undefined) {
					return result;
				}
			}
			if (this.kind === luau.SyntaxKind.UnaryExpression) {
				if (key === "operator") {
					return value;
				}
			} else if (this.kind === luau.SyntaxKind.BinaryExpression) {
				if (key === "operator") {
					return value;
				}
			}
			if (key === "parent") {
				return undefined;
			}
			if (key === "kind") {
				return kindToStr(value);
			}
			if (luau.list.isList(value)) {
				return luau.list.mapToArray(value, v => v);
			}
			return value;
		},
		"\t",
	);
}
