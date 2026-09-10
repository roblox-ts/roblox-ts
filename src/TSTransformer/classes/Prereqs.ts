import luau from "@roblox-ts/luau-ast";
import { valueToIdStr } from "TSTransformer/util/valueToIdStr";

// each collector owns one destination for generated statements
export class Prereqs {
	public readonly statements = luau.list.make<luau.Statement>();

	public push(statement: luau.Statement) {
		luau.list.push(this.statements, statement);
	}

	public pushList(statements: luau.List<luau.Statement>) {
		luau.list.pushList(this.statements, statements);
	}

	public unshift(statement: luau.Statement) {
		luau.list.unshift(this.statements, statement);
	}

	public unshiftList(statements: luau.List<luau.Statement>) {
		luau.list.unshiftList(this.statements, statements);
	}

	public pushToVar(expression: luau.Expression | undefined, name?: string) {
		const temp = luau.tempId(name || (expression && valueToIdStr(expression)));
		this.push(
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: temp,
				right: expression,
			}),
		);
		return temp;
	}

	public pushToVarIfComplex<T extends luau.Expression>(
		expression: T,
		name?: string,
	): Extract<T, luau.SimpleTypes> | luau.TemporaryIdentifier {
		if (luau.isSimple(expression)) {
			return expression as Extract<T, luau.SimpleTypes>;
		}
		return this.pushToVar(expression, name);
	}

	public pushToVarIfNonId<T extends luau.Expression>(expression: T, name?: string): luau.AnyIdentifier {
		if (luau.isAnyIdentifier(expression)) {
			return expression;
		}
		return this.pushToVar(expression, name);
	}
}
