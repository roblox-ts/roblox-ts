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

export function tempId() {
	return lua.create(lua.SyntaxKind.TemporaryIdentifier, {});
}

export function emptyId() {
	return lua.create(lua.SyntaxKind.EmptyIdentifier, {});
}

export function nil() {
	return lua.create(lua.SyntaxKind.NilLiteral, {});
}

export function bool(value: boolean) {
	if (value) {
		return lua.create(lua.SyntaxKind.TrueLiteral, {});
	} else {
		return lua.create(lua.SyntaxKind.FalseLiteral, {});
	}
}

export function number(value: number) {
	return lua.create(lua.SyntaxKind.NumberLiteral, { value });
}

export function string(value: string) {
	return lua.create(lua.SyntaxKind.StringLiteral, { value });
}

export function id(name: string) {
	return lua.create(lua.SyntaxKind.Identifier, { name });
}

export function comment(text: string) {
	return lua.create(lua.SyntaxKind.Comment, { text: " " + text });
}

export function array(members: Array<lua.Expression> = []) {
	return lua.create(lua.SyntaxKind.Array, {
		members: lua.list.make(...members),
	});
}

export function set(members: Array<lua.Expression> = []) {
	return lua.create(lua.SyntaxKind.Set, {
		members: lua.list.make(...members),
	});
}

export function map(fields: Array<[lua.Expression, lua.Expression]> = []) {
	return lua.create(lua.SyntaxKind.Map, {
		fields: lua.list.make(...fields.map(([index, value]) => lua.create(lua.SyntaxKind.MapField, { index, value }))),
	});
}
