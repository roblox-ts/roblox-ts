// keep cases alphabetized by name to match Jest's snapshot ordering
export const macroEvaluationCases = [
	{
		name: "bracket native method",
		source: `
			declare const workspace: Workspace;
			declare const values: Set<number>;
			workspace["SetAttribute"]("size", values.size());
		`,
	},
	{
		name: "builtin callee with coalescing prerequisites",
		source: `
			declare const text: string | undefined;
			const value = math.floor(math.log10(tonumber(text) ?? 1));
		`,
	},
	{
		name: "captured local writes",
		source: `
			declare let x: number;
			const change = () => { x = 9; return 2; };
			const result = x + change();
		`,
	},
	{
		name: "closure parameter beside a pure math call",
		source: `
			function gaussian(max: number) { return (x: number) => max * math.exp(x); }
		`,
	},
	{
		name: "complex assignment base",
		source: `
			declare const holder: {
				part: Part;
			};
			holder.part.Color = Color3.fromRGB(255, 0, 0);
		`,
	},
	{
		name: "complex assignment base before prerequisites",
		source: `
			declare const holder: {
				part: Part;
			};
			holder.part.Name = [1].map(() => "name")[0];
		`,
	},
	{
		name: "compound assignment with pure math",
		source: `
			declare const object: {
				angle: number;
			};
			object.angle += math.min(1, 2);
		`,
	},
	{
		name: "effectful native receiver",
		source: `
			declare function getPart(): Part;
			declare const values: Set<number>;
			getPart().SetAttribute("size", values.size());
		`,
	},
	{
		name: "immutable vector operands",
		source: `
			declare const a: Vector3, b: Vector3;
			const result = a.add(b);
		`,
	},
	{
		name: "imported callee with optional argument",
		source: `
			import { useValue } from "./stableImports";
			declare const object: {
				value: number;
			} | undefined;
			const result = useValue(object?.value);
		`,
	},
	{
		name: "includes and isEmpty",
		source: `
			declare const array: number[];
			const result = array.includes(3) && array.isEmpty();
		`,
	},
	{
		name: "includes property receiver",
		source: `
			declare const holder: {
				values: number[];
			};
			const result = holder.values.includes(3);
		`,
	},
	{
		name: "index offset folding",
		source: `
			declare const array: number[];
			declare function index(): number;
			const result = array.remove(index() - 1);
		`,
	},
	{
		name: "indexOf property operands",
		source: `
			declare const holder: {
				values: number[];
			};
			declare const object: {
				value: number;
			};
			const result = holder.values.indexOf(object.value);
		`,
	},
	{
		name: "known function with no external effects",
		source: `
			declare let map: Map<string, number>;
			function value() { return 1; }
			map.set("key", value());
		`,
	},
	{
		name: "map callback reuse",
		source: `
			declare const array: number[];
			declare const callback: (value: number) => number;
			const result = array.map(callback);
		`,
	},
	{
		name: "multiple array insertions",
		source: `
			declare let array: number[];
			declare function value(): number;
			array.push(value(), value());
		`,
	},
	{
		name: "native method in a constructor",
		source: `
			declare const animator: Animator, animation: Animation;
			class Example {
				track = animator.LoadAnimation(animation);
			}
		`,
	},
	{
		name: "native method with argument prerequisites",
		source: `
			declare const workspace: Workspace;
			declare const values: Set<number>;
			workspace.SetAttribute("size", values.size());
		`,
	},
	{
		name: "native receiver rebinding",
		source: `
			declare let part: Part;
			part.SetAttribute("value", [1].map(() => { part = new Instance("Part"); return 7; })[0]);
		`,
	},
	{
		name: "nested optional native calls",
		source: `
			declare const model: Model | undefined;
			declare const props: {
				maxHealth: number;
			};
			model?.SetAttribute("Health", model?.GetAttribute("MaxHealth") ?? props.maxHealth);
		`,
	},
	{
		name: "nested vector arithmetic",
		source: `
			declare const a: Vector3, b: Vector3, c: Vector3;
			const result = a.sub(b.add(c));
		`,
	},
	{
		name: "optional bracket native method",
		source: `
			declare const model: Model | undefined;
			declare const values: Set<number>;
			model?.["SetAttribute"]("size", values.size());
		`,
	},
	{
		name: "optional join separator",
		source: `
			declare const array: number[];
			declare const separator: string | undefined;
			const result = array.join(separator);
		`,
	},
	{
		name: "optional native method",
		source: `
			declare const model: Model | undefined;
			declare const values: Set<number>;
			model?.SetAttribute("size", values.size());
		`,
	},
	{
		name: "optional native receiver rebinding",
		source: `
			declare let model: Model | undefined;
			model?.SetAttribute("value", [1].map(() => { model = undefined; return 7; })[0]);
		`,
	},
	{
		name: "optional replaceable method",
		source: `
			declare const object: {
				SetAttribute(name: string, value: number): void;
			} | undefined;
			object?.SetAttribute("value", [1].map(() => { object!.SetAttribute = () => { }; return 7; })[0]);
		`,
	},
	{
		name: "possibly empty math varargs",
		source: `
			const min = math.min;
			const result = [min(), [1].map(() => 2)[0]];
		`,
	},
	{
		name: "receiver rebinding inside forEach",
		source: `
			declare let array: number[];
			array.forEach((value, index, original) => { array = []; assert(original !== array); });
		`,
	},
	{
		name: "reduce callback reuse",
		source: `
			declare const array: number[];
			declare const callback: (a: number, b: number) => number;
			const result = array.reduce(callback, 0);
		`,
	},
	{
		name: "replaceable library lookalike",
		source: `
			const library = { floor: (n: number) => n };
			const result = library.floor([1].map(() => { library.floor = () => 99; return 2; })[0]);
		`,
	},
	{
		name: "replaceable method lookalike",
		source: `
			declare const object: {
				SetAttribute(name: string, value: number): void;
			};
			declare const values: Set<number>;
			object.SetAttribute("size", values.size());
		`,
	},
	{
		name: "required join separator",
		source: `
			declare const array: number[];
			declare const separator: string;
			const result = array.join(separator);
		`,
	},
	{
		name: "scalar call arity",
		source: `
			declare function empty(): undefined;
			const result = typeOf(empty());
		`,
	},
	{
		name: "single array insertion",
		source: `
			declare let array: number[];
			declare function value(): number;
			array.push(value());
		`,
	},
	{
		name: "single map assignment",
		source: `
			declare const map: Map<string, number>;
			declare function value(): number;
			map.set("key", value());
		`,
	},
	{
		name: "stable imported assignment targets",
		source: `
			import { lighting } from "./stableImports";
			function apply(settings: {
				brightness: number;
				fogEnd: number;
			}) { lighting.Brightness = settings.brightness; lighting.FogEnd = settings.fogEnd; }
		`,
	},
	{
		name: "stable this assignment",
		source: `
			class Example {
				value = 0;
				update() { this.value = math.random(); }
			}
		`,
	},
	{
		name: "string macro receiver",
		source: `
			declare const object: {
				text: string;
			};
			const words = object.text.split(",");
		`,
	},
	{
		name: "tuple spread after explicit arguments",
		source: `
			declare const array: number[];
			const tuple: [
				number
			] = [9];
			array.insert(0, ...tuple);
		`,
	},
	{
		name: "uncaptured parameter beside a property read",
		source: `
			function compare(value: number, object: {
				value: number;
			}) { return value + object.value; }
		`,
	},
	{
		name: "vector receiver rebinding",
		source: `
			declare let a: Vector3;
			declare function change(): Vector3;
			const result = a.add(change());
		`,
	},
];
