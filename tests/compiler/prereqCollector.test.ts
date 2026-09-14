import luau from "@roblox-ts/luau-ast";
import { Prereqs } from "TSTransformer/classes/Prereqs";

it("prepends prerequisite lists in order without affecting another collector", () => {
	const prereqs = new Prereqs();
	const otherPrereqs = new Prereqs();
	const first = luau.create(luau.SyntaxKind.CallStatement, { expression: luau.call(luau.id("first")) });
	const second = luau.create(luau.SyntaxKind.CallStatement, { expression: luau.call(luau.id("second")) });
	const third = luau.create(luau.SyntaxKind.CallStatement, { expression: luau.call(luau.id("third")) });

	otherPrereqs.push(third);
	prereqs.push(third);
	prereqs.unshiftList(luau.list.make(first, second));
	prereqs.unshiftList(luau.list.make());

	expect(luau.list.toArray(prereqs.statements)).toEqual([first, second, third]);
	expect(luau.list.toArray(otherPrereqs.statements)).toEqual([third]);
});
