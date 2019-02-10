import * as ts from "ts-morph";

export function isType(node: ts.Node) {
	return (
		ts.TypeGuards.isEmptyStatement(node) ||
		ts.TypeGuards.isTypeAliasDeclaration(node) ||
		ts.TypeGuards.isInterfaceDeclaration(node) ||
		(ts.TypeGuards.isAmbientableNode(node) && node.hasDeclareKeyword())
	);
}

export function inheritsFrom(type: ts.Type, className: string): boolean {
	const symbol = type.getSymbol();
	if (symbol) {
		if (symbol.getName() === className) {
			return true;
		}
		const declarations = symbol.getDeclarations();
		for (const declaration of declarations) {
			if (!ts.TypeGuards.isSourceFile(declaration)) {
				const decType = declaration.getType();
				const decBaseTypes = decType.getBaseTypes();
				for (const baseType of decBaseTypes) {
					if (inheritsFrom(baseType, className)) {
						return true;
					}
				}
			}
		}
	}
	return false;
}

export function isTypeOnlyNamespace(node: ts.NamespaceDeclaration) {
	const statements = node.getStatements();
	for (const statement of statements) {
		if (!ts.TypeGuards.isNamespaceDeclaration(statement) && !isType(statement)) {
			return false;
		}
	}
	for (const statement of statements) {
		if (ts.TypeGuards.isNamespaceDeclaration(statement) && !isTypeOnlyNamespace(statement)) {
			return false;
		}
	}
	return true;
}

export function typeConstraint(type: ts.Type, cb: (type: ts.Type) => boolean): boolean {
	if (type.isUnion()) {
		return type.getUnionTypes().every(t => typeConstraint(t, cb));
	} else if (type.isIntersection()) {
		return type.getIntersectionTypes().some(t => typeConstraint(t, cb));
	} else {
		return cb(type);
	}
}

export function isAnyType(type: ts.Type) {
	return type.getText() === "any";
}

export function isNullableType(type: ts.Type) {
	return typeConstraint(type, t => t.isNullable());
}

export function isBooleanType(type: ts.Type) {
	return typeConstraint(type, t => t.isBoolean() || t.isBooleanLiteral());
}

export function isNumberType(type: ts.Type) {
	return typeConstraint(type, t => t.isNumber() || t.isNumberLiteral());
}

export function isStringType(type: ts.Type) {
	return typeConstraint(type, t => t.isString() || t.isStringLiteral());
}

export function isEnumType(type: ts.Type) {
	return typeConstraint(type, t => {
		const symbol = t.getSymbol();
		return symbol !== undefined && symbol.getDeclarations().some(d => ts.TypeGuards.isEnumDeclaration(d));
	});
}

export function isArrayType(type: ts.Type) {
	return typeConstraint(
		type,
		t => t.getArrayType() !== undefined || (t.getNumberIndexType() !== undefined && !isEnumType(t)),
	);
}

export function isTupleType(type: ts.Type) {
	return typeConstraint(type, t => t.isTuple());
}
