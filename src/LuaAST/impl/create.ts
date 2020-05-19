// helper creation
import * as lua from "LuaAST";

type AllowedFieldTypes = lua.Node | lua.List<lua.Node> | boolean | number | string | undefined;

type FilterProps<T, U> = { [K in keyof T]: T[K] extends U ? T[K] : never };
type FilteredNodeByKind<T extends keyof lua.NodeByKind> = FilterProps<lua.NodeByKind[T], AllowedFieldTypes>;

// creation
export function create<T extends keyof lua.NodeByKind>(
	kind: T,
	fields: {
		[K in Exclude<keyof FilteredNodeByKind<T>, keyof lua.Node>]: FilteredNodeByKind<T>[K];
	},
): lua.NodeByKind[T] {
	// super hack!
	const node = (Object.assign({ kind }, fields) as unknown) as lua.NodeByKind[T];

	// if value is node, value.Parent = node
	// if value is list, lua.list.forEach(value, subValue => subValue.Parent = node)
	for (const value of Object.values(fields)) {
		if (lua.isNode(value)) {
			value.parent = node;
		} else if (lua.list.isList(value)) {
			lua.list.forEach(value, subValue => (subValue.parent = node));
		}
	}

	return node;
}

/**
 * Creates a new temporary identifier for a node.
 */
export function tempId() {
	return lua.create(lua.SyntaxKind.TemporaryIdentifier, {});
}

/**
 * Creates a new empty identifier '_' for a node.
 */
export function emptyId() {
	return lua.create(lua.SyntaxKind.EmptyIdentifier, {});
}

/**
 * Creates a new `nil` literal node.
 */
export function nil() {
	return lua.create(lua.SyntaxKind.NilLiteral, {});
}

/**
 * Creates a new `boolean` literal node.
 * @param value The value of the boolean literal.
 */
export function bool(value: boolean) {
	if (value) {
		return lua.create(lua.SyntaxKind.TrueLiteral, {});
	} else {
		return lua.create(lua.SyntaxKind.FalseLiteral, {});
	}
}

/**
 * Creates a new `number` literal node.
 * @param value The number to make
 */
export function number(value: number) {
	return lua.create(lua.SyntaxKind.NumberLiteral, { value });
}

/**
 * Creates a new `string` literal node.
 * @param value The value of the string
 */
export function string(value: string) {
	return lua.create(lua.SyntaxKind.StringLiteral, { value });
}

/**
 * Creates a new identifier node.
 * @param name The name of the identifier.
 */
export function id(name: string) {
	return lua.create(lua.SyntaxKind.Identifier, { name });
}

/**
 * Creates a new comment node.
 * @param text The text of the comment
 */
export function comment(text: string) {
	return lua.create(lua.SyntaxKind.Comment, { text: " " + text });
}

/**
 * Creates a new array node.
 * @param members The `lua.Expression` nodes of the new array.
 */
export function array(members: Array<lua.Expression> = []) {
	return lua.create(lua.SyntaxKind.Array, {
		members: lua.list.make(...members),
	});
}

/**
 * Creates a new set node.
 * @param members The `lua.Expression` nodes of the new set.
 */
export function set(members: Array<lua.Expression> = []) {
	return lua.create(lua.SyntaxKind.Set, {
		members: lua.list.make(...members),
	});
}

/**
 * Creates a new map node.
 * @param fields The array of key-value mappings.
 */
export function map(fields: Array<[lua.Expression, lua.Expression]> = []) {
	return lua.create(lua.SyntaxKind.Map, {
		fields: lua.list.make(...fields.map(([index, value]) => lua.create(lua.SyntaxKind.MapField, { index, value }))),
	});
}

export function mixedTable(fields: Array<lua.Expression | [lua.Expression, lua.Expression]> = []) {
	return lua.create(lua.SyntaxKind.MixedTable, {
		fields: lua.list.make(
			...fields.map(field => {
				if (Array.isArray(field)) {
					return lua.create(lua.SyntaxKind.MapField, { index: field[0], value: field[1] });
				} else {
					return field;
				}
			}),
		),
	});
}
