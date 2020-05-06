import * as lua from "LuaAST";

function kindToStr(syntaxKind: lua.SyntaxKind) {
	const result = lua.SyntaxKind[syntaxKind];
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

function visualizeNode(node: lua.Node) {
	if (lua.isIdentifier(node)) {
		return `id(${node.name})`;
	} else if (lua.isTemporaryIdentifier(node)) {
		return `id(TEMP)`;
	} else if (lua.isEmptyIdentifier(node)) {
		return `id(_)`;
	} else if (lua.isNumberLiteral(node) || lua.isStringLiteral(node)) {
		return node.value;
	} else if (lua.isNilLiteral(node)) {
		return null;
	} else if (lua.isTrueLiteral(node)) {
		return true;
	} else if (lua.isFalseLiteral(node)) {
		return false;
	}
}

export function visualizeAST(ast: lua.Node | lua.List<lua.Node>) {
	return JSON.stringify(
		ast,
		function(key, value) {
			if (lua.isNode(value)) {
				const result = visualizeNode(value);
				if (result !== undefined) {
					return result;
				}
			}
			if (this.kind === lua.SyntaxKind.UnaryExpression) {
				if (key === "operator") {
					return value;
				}
			} else if (this.kind === lua.SyntaxKind.BinaryExpression) {
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
			if (lua.list.isList(value)) {
				return lua.list.mapToArray(value, v => v);
			}
			return value;
		},
		"\t",
	);
}
