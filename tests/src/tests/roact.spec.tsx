/// <reference types="@rbxts/testez/globals" />
/// <reference types="@rbxts/roact/internal"/>

import Roact from "@rbxts/roact";

const RoactModule = game
	.GetService("ReplicatedStorage")
	.WaitForChild("include")
	.WaitForChild("node_modules")
	.WaitForChild("roact")
	.WaitForChild("roact")
	.WaitForChild("src") as ModuleScript;

declare interface ElementKind {
	Portal: symbol;
	Host: symbol;
	Function: symbol;
	Stateful: symbol;
	Fragment: symbol;
	of: (value: unknown) => boolean;
}
const ElementKind = require(RoactModule.WaitForChild(
	"ElementKind"
) as ModuleScript) as ElementKind;

declare interface Type {
	Binding: symbol;
	Element: symbol;
	HostChangeEvent: symbol;
	HostEvent: symbol;
	StatefulComponentClass: symbol;
	VirtualNode: symbol;
	VirtualTree: symbol;
	of: (value: unknown) => boolean;
}
const Type = require(RoactModule.WaitForChild("Type") as ModuleScript) as Type;

type ExplicitProps<P = {}> = Partial<P> & {
	[Roact.Children]: { [name: string]: Roact.Element | undefined };
};
interface FragmentLike {
	elements: { [name: string]: unknown };
}

export = () => {
	describe("should support Roact.Component", () => {
		it("should construct a roact class", () => {
			class RoactClass extends Roact.Component {
				public render(): Roact.Element {
					return <frame />;
				}
			}

			expect(Type.of(RoactClass)).to.equal(Type.StatefulComponentClass);
		});

		it("should construct a roact pure component class", () => {
			class RoactPureClass extends Roact.PureComponent {
				public render(): Roact.Element {
					return <frame />;
				}
			}

			expect(Type.of(RoactPureClass)).to.equal(
				Type.StatefulComponentClass
			);
		});

		it("should construct default props", () => {
			interface RoactProps {
				value: number;
			}
			class RoactClass extends Roact.Component {
				public static defaultProps: RoactProps = {
					value: 10
				};

				public render(): Roact.Element {
					return <frame />;
				}
			}

			expect(RoactClass.defaultProps).to.be.a("table");
		});

		it("should support static getDerivedStateFromProps", () => {
			interface TestState {
				someValue: number;
			}

			interface TestProps {
				someValue: number;
			}

			class RoactClass extends Roact.Component<TestProps, TestState> {
				public static getDerivedStateFromProps(
					nextProps: TestProps,
					lastState: TestState
				): TestState {
					return { someValue: nextProps.someValue };
				}

				public render(): Roact.Element {
					return <frame />;
				}
			}

			expect((RoactClass as { getDerivedStateFromProps: unknown }).getDerivedStateFromProps).to.be.a("function");
		});

		it("should mount a roact object", () => {
			class RoactClass extends Roact.Component {
				public render(): Roact.Element {
					return <frame />;
				}
			}

			const element = <RoactClass />;
			expect(Type.of(element)).to.equal(Type.Element);

			const handle = Roact.mount(element);
			expect(Type.of(handle)).to.equal(Type.VirtualTree);
		});
	});

	it("should create roact intrinsics", () => {
		const RoactIntrinsic = <frame />;
		const RoactIntrinsicManual = Roact.createElement("Frame");

		// Both should be a Frame
		expect(RoactIntrinsic.component).to.equal(
			RoactIntrinsicManual.component
		);
	});

	describe("should support all roact property types", () => {
		// it("should be able to have keyed children", () => {
		// 	const KEY = "key1";
		// 	const KEY2 = "key2";

		// 	const element = (
		// 		<screengui>
		// 			<frame Key={KEY} />
		// 			<frame Key={KEY2} />
		// 		</screengui>
		// 	);

		// 	const handle = Roact.mount(element);

		// 	const frameKey = handle._children![KEY];
		// 	const frame2Key = handle._children![KEY2];

		// 	expect(frameKey).to.be.ok();
		// 	expect(frame2Key).to.be.ok();
		// });

		it("should support props", () => {
			const TEXT = "Hello, World!";
			const propElement = <textbutton Text={TEXT} />;
			const propElementProps = propElement.props as Roact.Template<
				TextButton
			>;

			expect(propElementProps.Text).to.equal(TEXT);
		});

		interface UniqueSymbolsRequired {
			readonly MouseButton1Click: unique symbol;
			readonly AbsoluteSize: unique symbol;
			[name: string]: symbol;
		}

		const EventHack = Roact.Event as UniqueSymbolsRequired;
		const ChangeHack = Roact.Change as UniqueSymbolsRequired;

		interface UniqueSymbolsForTests {
			[EventHack.MouseButton1Click]: number;
			[ChangeHack.AbsoluteSize]: number;
		}

		it("should support [Roact.Event]", () => {
			const eventElement = (
				<textbutton
					Event={{
						MouseButton1Click: () => {}
					}}
				/>
			);

			const eventElementProps = eventElement.props as UniqueSymbolsForTests;

			expect(eventElementProps[EventHack.MouseButton1Click]).to.be.a(
				"function"
			);
		});

		it("should support [Roact.Change]", () => {
			const eventElement = (
				<textbutton
					Change={{
						AbsoluteSize: () => {}
					}}
				/>
			);
			const eventElementProps = eventElement.props as UniqueSymbolsForTests;
			expect(eventElementProps[ChangeHack.AbsoluteSize]).to.be.a(
				"function"
			);
		});
		describe("should support [Roact.Ref]", () => {
			/*
				These are based basically off the Roact tests.
			*/

			it("should handle object references properly", () => {
				const frameRef: Roact.Ref<Frame> = Roact.createRef<Frame>();

				Roact.mount(<frame Ref={frameRef} />);

				// expect(frameRef.current).to.be.ok();
				expect(Type.of(frameRef)).to.equal(Type.Binding); // Refs are bindings
			});

			it("should handle function references properly", () => {
				let currentRbx: Frame;

				function ref(rbx: Frame) {
					currentRbx = rbx;
				}

				const element = <frame Ref={ref} />;
				const handle = Roact.mount(element);
				expect(currentRbx!).to.be.ok();
			});

			it("should handle class references properly", () => {
				class RoactRefTest extends Roact.Component {
					public ref: Roact.Ref<ScreenGui>;

					constructor(p: {}) {
						super(p);
						this.ref = Roact.createRef<ScreenGui>();
					}

					public render(): Roact.Element {
						return <screengui Ref={this.ref} />;
					}

					public didUpdate() {
						expect(this.ref.getValue()).to.be.ok();
					}
				}

				Roact.mount(<RoactRefTest />);
			});

			it("should handle class function references properly", () => {
				let worked = false;
				class RoactRefTest extends Roact.Component {
					public onScreenGuiRender = (rbx: ScreenGui) => {
						worked = true;
					};
					public render(): Roact.Element {
						return <screengui Ref={this.onScreenGuiRender} />;
					}
				}

				Roact.mount(<RoactRefTest />);
				expect(worked).to.be.ok();
			});
		});
	});

	it("should support JSX Fragments", () => {
		const fragment = (
			<Roact.Fragment>
				<frame Key="TestKey" />
			</Roact.Fragment>
		);

		expect(Type.of(fragment)).to.equal(Type.Element);
		expect(ElementKind.of(fragment)).to.equal(ElementKind.Fragment);
		expect(
			ElementKind.of(
				((fragment as unknown) as FragmentLike).elements.TestKey
			)
		).to.equal(ElementKind.Host);
	});

	it("Should default to using a Fragment for top-level keys", () => {
		const test = <frame Key="Testing" />;
		expect(Type.of(test)).to.equal(Type.Element);
		expect(ElementKind.of(test)).to.equal(ElementKind.Fragment);
	});

	describe("BinaryExpressions", () => {
		it("should support BinaryExpressions", () => {
			let ref: Frame | undefined;
			const test = (
				<frame>{true && <frame Ref={rbx => (ref = rbx)} />}</frame>
			);
			Roact.mount(test);
			expect(ref).to.be.ok();
		});
	});

	describe("ConditionalExpressions", () => {
		it("should support ConditionalExpressions", () => {
			let ref: Frame | TextLabel | undefined;
			let ref2: Frame | TextLabel | undefined;
			const test = (
				<frame>
					{false ? (
						<frame Ref={rbx => (ref = rbx)} />
					) : (
						<textlabel Ref={rbx => (ref = rbx)} />
					)}
				</frame>
			);

			const test2 = (
				<frame>
					{true ? (
						<frame Ref={rbx => (ref2 = rbx)} />
					) : (
						<textlabel Ref={rbx => (ref2 = rbx)} />
					)}
				</frame>
			);

			Roact.mount(test);
			Roact.mount(test2);

			expect(ref).to.be.ok();
			expect(typeIs(ref, "Instance") && ref.IsA("TextLabel")).to.equal(
				true
			);

			expect(ref2).to.be.ok();
			expect(typeIs(ref2, "Instance") && ref2.IsA("Frame")).to.equal(
				true
			);
		});
	});

	it("should support nesting maps", () => {
		const map = new Map<string, Roact.Element>();
		let ref: TextLabel | undefined;
		const testLabel = <textlabel Ref={rbx => (ref = rbx)} Text="Texty" />;
		map.set("Testing", testLabel);

		const element = <screengui>{map}</screengui>;

		expect(Type.of(element)).to.equal(Type.Element);
		expect(
			(element.props as ExplicitProps)[Roact.Children].Testing
		).to.equal(testLabel);

		Roact.mount(element);
		expect(ref).to.be.ok();
		expect(
			typeIs(ref, "Instance") &&
				ref.IsA("TextLabel") &&
				ref.Text === "Texty"
		).to.equal(true);
	});

	it("should support implicit true in JSX elements", () => {
		const element = <textlabel TextWrapped />;

		expect(
			(element.props as ExplicitProps<TextLabel>).TextWrapped
		).to.equal(true);
	});

	it("should have correct-order prop joining", () => {
		const TestProps = {
			Active: false,
			BackgroundColor3: Color3.fromRGB(220, 0, 0)
		};

		const element = (
			<frame
				// @ts-ignore
				Active
				{...TestProps}
				BackgroundColor3={new Color3(0, 0, 0)}
			/>
		);
		const props = element.props as ExplicitProps<Frame>;

		expect(props.Active).to.equal(false);
		expect(props.BackgroundColor3).to.equal(new Color3(0, 0, 0));
	});

	it("should support passing identifier objects as events/changed handlers", () => {
		const Events: RoactEvents<Frame> = {
			MouseEnter: () => {}
		};

		const f = <frame Event={Events} />;
		const props = f.props as ExplicitProps<Frame>;

		// eslint-disable-next-line @typescript-eslint/ban-ts-ignore
		// @ts-ignore because this is valid, but I can't infer the type for this
		expect(props[Roact.Event.MouseEnter] as unknown).to.equal(
			Events.MouseEnter
		);
	});
};
