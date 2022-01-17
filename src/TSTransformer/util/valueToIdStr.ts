import luau from "@roblox-ts/luau-ast";

function expressionToStr(expression: luau.Expression): string | undefined {
	// X -> "X"
	if (luau.isIdentifier(expression)) {
		return expression.name;
	}

	// A.B -> "B"
	if (luau.isPropertyAccessExpression(expression)) {
		return expression.name;
	}

	if (luau.isCallExpression(expression)) {
		// X.new() -> "X"
		if (luau.isPropertyAccessExpression(expression.expression) && expression.expression.name === "new") {
			return expressionToStr(expression.expression.expression);
		}
	}
}

function uncapitalizeFirstLetter(str: string) {
	return str.charAt(0).toLowerCase() + str.slice(1);
}

export function valueToIdStr(value: luau.Expression): string {
	const valueStr = expressionToStr(value);
	if (valueStr !== undefined) {
		return uncapitalizeFirstLetter(valueStr);
	}

	return "";
}
