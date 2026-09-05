import luau, { renderAST } from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import {
	canDiscard,
	canRepeat,
	effectsCommute,
	EvaluationEffects,
	getEffects,
	NO_EFFECTS,
	UNKNOWN_EFFECTS,
} from "TSTransformer/util/evaluation/effects";
import { EvaluationOperand, planEvaluation } from "TSTransformer/util/evaluation/plan";

function compileExpansion(
	values: Array<luau.Expression>,
	expand: (state: TransformState, values: Array<luau.Expression>) => luau.Expression,
	prereqs: Array<luau.List<luau.Statement>> = [],
) {
	const statements = luau.list.make<luau.Statement>();
	const state: TransformState = Object.assign(Object.create(TransformState.prototype), {
		prereqStatementsStack: [statements],
	});
	const operands: Array<EvaluationOperand> = values.map((expression, i) => ({
		expression,
		prereqs: prereqs[i] ?? luau.list.make(),
	}));
	const result = planEvaluation(state, operands, values => expand(state, values));
	luau.list.push(statements, luau.create(luau.SyntaxKind.ReturnStatement, { expression: result }));
	return renderAST(statements);
}

describe("evaluation effects", () => {
	const captured = { captured: true, writtenByClosure: false };
	const writableByClosure = { captured: true, writtenByClosure: true };
	const uncaptured = { captured: false, writtenByClosure: false };
	const cases: Array<{
		name: string;
		left: EvaluationEffects;
		right: EvaluationEffects;
		commute: boolean;
	}> = [
		{
			name: "independent binding accesses can move",
			left: { ...NO_EFFECTS, reads: new Set(["a"]) },
			right: { ...NO_EFFECTS, writes: new Set(["b"]) },
			commute: true,
		},
		{
			name: "a binding read cannot cross its write",
			left: { ...NO_EFFECTS, reads: new Set(["a"]) },
			right: { ...NO_EFFECTS, writes: new Set(["a"]) },
			commute: false,
		},
		{
			name: "heap reads cannot cross heap writes",
			left: { ...NO_EFFECTS, readsHeap: true },
			right: { ...NO_EFFECTS, writesHeap: true },
			commute: false,
		},
		{
			name: "errors cannot cross observable writes",
			left: { ...NO_EFFECTS, throws: true },
			right: { ...NO_EFFECTS, writes: new Set(["a"]) },
			commute: false,
		},
		{
			name: "two possible errors must remain ordered",
			left: { ...NO_EFFECTS, throws: true },
			right: { ...NO_EFFECTS, throws: true },
			commute: false,
		},
		{
			name: "unknown calls cannot rebind an uncaptured local",
			left: { ...NO_EFFECTS, reads: new Set([uncaptured]) },
			right: UNKNOWN_EFFECTS,
			commute: true,
		},
		{
			name: "read-only captures do not expose a binding to unknown writes",
			left: { ...NO_EFFECTS, reads: new Set([captured]) },
			right: UNKNOWN_EFFECTS,
			commute: true,
		},
		{
			name: "closure writes prevent moving a read across unknown calls",
			left: { ...NO_EFFECTS, reads: new Set([writableByClosure]) },
			right: UNKNOWN_EFFECTS,
			commute: false,
		},
		{
			name: "unknown calls may observe an explicit write to a captured binding",
			left: { ...NO_EFFECTS, writes: new Set([captured]) },
			right: UNKNOWN_EFFECTS,
			commute: false,
		},
		{
			name: "unknown calls cannot access compiler temporaries",
			left: { ...NO_EFFECTS, writes: new Set([1]) },
			right: UNKNOWN_EFFECTS,
			commute: true,
		},
	];

	it.each(cases)("$name", ({ left, right, commute }) => {
		expect(effectsCommute(left, right)).toBe(commute);
		expect(effectsCommute(right, left)).toBe(commute);
	});

	it("distinguishes discarding an allocation from duplicating its identity", () => {
		const effects = getEffects(luau.array());
		expect(canDiscard(effects)).toBe(true);
		expect(canRepeat(effects)).toBe(false);
	});
});

describe("operand evaluation planning", () => {
	it("expands once and leaves ordered single uses inline", () => {
		let expansions = 0;
		const output = compileExpansion([luau.call(luau.id("first")), luau.call(luau.id("second"))], (_, args) => {
			expansions++;
			return luau.call(luau.globals.table.insert, args);
		});
		expect(expansions).toBe(1);
		expect(output).toBe("return table.insert(first(), second())\n");
	});

	it("evaluates an unused effectful argument without a wasteful local", () => {
		expect(compileExpansion([luau.call(luau.id("effect"))], () => luau.number(1))).toBe("effect()\nreturn 1\n");
	});

	it("captures an allocation reused through cloned nodes", () => {
		expect(compileExpansion([luau.array()], (_, [value]) => luau.array([value, value]))).toMatchInlineSnapshot(`
		"local _exp = {}
		return { _exp, _exp }
		"
	`);
	});

	it("captures a conditional operand even when it occurs once", () => {
		expect(
			compileExpansion([luau.call(luau.id("effect"))], (_, [value]) =>
				luau.binary(luau.id("condition"), "and", value),
			),
		).toMatchInlineSnapshot(`
		"local _exp = effect()
		return condition and _exp
		"
	`);
	});

	it("captures values used by a closure before subsequent mutations", () => {
		expect(
			compileExpansion([luau.id("value")], (_, [value]) =>
				luau.create(luau.SyntaxKind.FunctionExpression, {
					parameters: luau.list.make(),
					hasDotDotDot: false,
					statements: luau.list.make(luau.create(luau.SyntaxKind.ReturnStatement, { expression: value })),
				}),
			),
		).toMatchInlineSnapshot(`
		"local _exp = value
		return function()
			return _exp
		end
		"
	`);
	});

	it("cascades captures across a later operand's prerequisites", () => {
		const prerequisite = luau.list.make(
			luau.create(luau.SyntaxKind.CallStatement, { expression: luau.call(luau.id("prerequisite")) }),
		);
		expect(
			compileExpansion(
				[luau.call(luau.id("first")), luau.call(luau.id("second"))],
				(_, args) => luau.call(luau.id("consume"), args),
				[luau.list.make(), prerequisite],
			),
		).toMatchInlineSnapshot(`
		"local _exp = first()
		prerequisite()
		local _arg0 = second()
		return consume(_exp, _arg0)
		"
	`);
	});

	it("orders late register reads in arithmetic", () => {
		expect(
			compileExpansion([luau.id("value"), luau.call(luau.id("change"))], (_, [a, b]) => luau.binary(a, "+", b)),
		).toMatchInlineSnapshot(`
		"local _exp = value
		return _exp + change()
		"
	`);
	});

	it("keeps independent operand identities when input AST nodes are shared", () => {
		const call = luau.call(luau.id("effect"));
		expect(compileExpansion([call, call], (_, args) => luau.call(luau.globals.table.insert, args))).toBe(
			"return table.insert(effect(), effect())\n",
		);
	});

	it("rejects assignment to an operand reference", () => {
		expect(() =>
			compileExpansion([luau.call(luau.id("effect"))], (state, [value]) => {
				state.prereq(
					luau.create(luau.SyntaxKind.Assignment, {
						left: value as luau.AnyIdentifier,
						operator: "=",
						right: luau.number(0),
					}),
				);
				return value;
			}),
		).toThrow("A macro must not assign to an operand reference");
	});

	it("rejects redeclaration of an operand reference", () => {
		expect(() =>
			compileExpansion([luau.call(luau.id("effect"))], (state, [value]) => {
				state.prereq(
					luau.create(luau.SyntaxKind.VariableDeclaration, {
						left: value as luau.AnyIdentifier,
						right: luau.number(0),
					}),
				);
				return value;
			}),
		).toThrow("A macro must not redeclare an operand reference");
	});

	it("composes nested expansions without losing outer references", () => {
		expect(
			compileExpansion([luau.call(luau.id("effect"))], (state, [value]) =>
				planEvaluation(state, [{ expression: value, prereqs: luau.list.make() }], ([inner]) =>
					luau.array([inner, inner]),
				),
			),
		).toMatchInlineSnapshot(`
		"local _exp = effect()
		return { _exp, _exp }
		"
	`);
	});

	it("does not treat a working temporary as immutable", () => {
		const value = luau.tempId("working");
		const write = luau.list.make(
			luau.create(luau.SyntaxKind.Assignment, { left: value, operator: "=", right: luau.number(2) }),
		);
		expect(compileExpansion([value, luau.number(3)], (_, args) => luau.array(args), [luau.list.make(), write]))
			.toMatchInlineSnapshot(`
		"local _exp = _working
		_working = 2
		return { _exp, 3 }
		"
	`);
	});

	it("evaluates operands before an early return in the expansion", () => {
		expect(
			compileExpansion([luau.call(luau.id("effect"))], (state, [value]) => {
				state.prereq(
					luau.create(luau.SyntaxKind.IfStatement, {
						condition: luau.id("condition"),
						statements: luau.list.make(
							luau.create(luau.SyntaxKind.ReturnStatement, { expression: luau.number(0) }),
						),
						elseBody: luau.list.make(),
					}),
				);
				return value;
			}),
		).toMatchInlineSnapshot(`
		"local _exp = effect()
		if condition then
			return 0
		end
		return _exp
		"
	`);
	});
});
