import { globals } from "LuauAST/impl/globals";

export function isReservedIdentifier(id: string) {
	return id in globals;
}
