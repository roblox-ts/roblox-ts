import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { isDefinitelyType, isRobloxType, isSharedTableType, walkTypes } from "TSTransformer/util/types";
import ts from "typescript";

export function createObjectRest(
	state: TransformState,
	prereqs: Prereqs,
	node: ts.Node,
	type: ts.Type,
	source: luau.AnyIdentifier,
	keys: Array<luau.Expression>,
) {
	const isUnsupported = (type: ts.Type) => isRobloxType(state)(type) && !isSharedTableType(state)(type);
	let unsupported = false;
	walkTypes(type, type => {
		unsupported ||= isDefinitelyType(type, isUnsupported);
	});
	if (unsupported) {
		DiagnosticService.addDiagnostic(errors.noRestSpreadingOfRobloxTypes(node));
		return luau.none();
	}

	const rest = prereqs.pushToVar(luau.map(), "rest");
	const key = luau.tempId("key");
	const value = luau.tempId("value");
	let statements = luau.list.make<luau.Statement>(
		luau.create(luau.SyntaxKind.Assignment, {
			left: luau.create(luau.SyntaxKind.ComputedIndexExpression, { expression: rest, index: key }),
			operator: "=",
			right: value,
		}),
	);
	if (keys.length > 0) {
		const condition =
			keys.length === 1
				? luau.binary(key, "~=", keys[0])
				: luau.unary(
						"not",
						luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: prereqs.pushToVar(luau.set(keys), "extracted"),
							index: key,
						}),
					);
		statements = luau.list.make(
			luau.create(luau.SyntaxKind.IfStatement, {
				condition,
				statements,
				elseBody: luau.list.make(),
			}),
		);
	}
	prereqs.push(
		luau.create(luau.SyntaxKind.ForStatement, {
			ids: luau.list.make(key, value),
			expression: source,
			statements,
		}),
	);
	return rest;
}
