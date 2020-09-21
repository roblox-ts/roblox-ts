// helper creation
import * as luau from "LuauAST/bundle";

type AllowedFieldTypes = luau.Node | luau.List<luau.Node> | boolean | number | string | undefined;
type FilterProps<T, U> = { [K in keyof T]: T[K] extends U ? T[K] : never };
type FilteredNodeByKind<T extends keyof luau.NodeByKind> = FilterProps<luau.NodeByKind[T], AllowedFieldTypes>;

// creation
export function create<T extends keyof luau.NodeByKind>(
	kind: T,
	fields: {
		[K in Exclude<keyof FilteredNodeByKind<T>, keyof luau.Node>]: FilteredNodeByKind<T>[K];
	},
): luau.NodeByKind[T] {
	// super hack!
	const node = (Object.assign({ kind }, fields) as unknown) as luau.NodeByKind[T];

	// if value is node, value.Parent = node
	// if value is list, luau.list.forEach(value, subValue => subValue.Parent = node)
	for (const value of Object.values(fields)) {
		if (luau.isNode(value)) {
			value.parent = node;
		} else if (luau.list.isList(value)) {
			luau.list.forEach(value, subValue => (subValue.parent = node));
		}
	}

	return node;
}

/**
 * Creates a new temporary identifier for a node.
 */
export function tempId() {
	return luau.create(luau.SyntaxKind.TemporaryIdentifier, {});
}

/**
 * Creates a new empty identifier '_' for a node.
 */
export function emptyId() {
	return luau.create(luau.SyntaxKind.EmptyIdentifier, {});
}

/**
 * Creates a new `nil` literal node.
 */
export function nil() {
	return luau.create(luau.SyntaxKind.NilLiteral, {});
}

/**
 * Creates a new `boolean` literal node.
 * @param value The value of the boolean literal.
 */
export function bool(value: boolean) {
	if (value) {
		return luau.create(luau.SyntaxKind.TrueLiteral, {});
	} else {
		return luau.create(luau.SyntaxKind.FalseLiteral, {});
	}
}

/**
 * Creates a new `number` literal node.
 * @param value The number to make
 */
export function number(value: number) {
	return luau.create(luau.SyntaxKind.NumberLiteral, { value: String(value) });
}

/**
 * Creates a new `string` literal node.
 * @param value The value of the string
 */
export function string(value: string) {
	return luau.create(luau.SyntaxKind.StringLiteral, { value });
}

/**
 * Creates a new identifier node.
 * @param name The name of the identifier.
 */
export function id(name: string) {
	return luau.create(luau.SyntaxKind.Identifier, { name });
}

/**
 * Creates a new comment node.
 * @param text The text of the comment
 */
export function comment(text: string) {
	return luau.create(luau.SyntaxKind.Comment, { text });
}

/**
 * Creates a new array node.
 * @param members The `luau.Expression` nodes of the new array.
 */
export function array(members: Array<luau.Expression> = []) {
	return luau.create(luau.SyntaxKind.Array, {
		members: luau.list.make(...members),
	});
}

/**
 * Creates a new set node.
 * @param members The `luau.Expression` nodes of the new set.
 */
export function set(members: Array<luau.Expression> = []) {
	return luau.create(luau.SyntaxKind.Set, {
		members: luau.list.make(...members),
	});
}

/**
 * Creates a new map node.
 * @param fields The array of key-value mappings.
 */
export function map(fields: Array<[luau.Expression, luau.Expression]> = []) {
	return luau.create(luau.SyntaxKind.Map, {
		fields: luau.list.make(
			...fields.map(([index, value]) => luau.create(luau.SyntaxKind.MapField, { index, value })),
		),
	});
}

/**
 * Creates a new mixed table node.
 * @param fields The array of either value or key-value mappings.
 */
export function mixedTable(fields: Array<luau.Expression | [luau.Expression, luau.Expression]> = []) {
	return luau.create(luau.SyntaxKind.MixedTable, {
		fields: luau.list.make(
			...fields.map(field => {
				if (Array.isArray(field)) {
					return luau.create(luau.SyntaxKind.MapField, { index: field[0], value: field[1] });
				} else {
					return field;
				}
			}),
		),
	});
}

export function binary(left: luau.Expression, operator: luau.BinaryOperator, right: luau.Expression) {
	return luau.create(luau.SyntaxKind.BinaryExpression, { left, operator, right });
}

export function unary(operator: luau.UnaryOperator, expression: luau.Expression) {
	return luau.create(luau.SyntaxKind.UnaryExpression, { operator, expression });
}
