const LUAU_RESERVED_CLASS_FIELDS = new Set(["__index", "new"]);

export function isReservedClassField(id: string) {
	return LUAU_RESERVED_CLASS_FIELDS.has(id);
}

const ROACT_RESERVED_CLASS_FIELDS = new Set(["init"]);

export function isReservedRoactClassField(id: string) {
	return ROACT_RESERVED_CLASS_FIELDS.has(id);
}
