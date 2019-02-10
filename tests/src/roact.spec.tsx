import * as Roact from "rbx-roact";

export = () => {
	describe("should support Roact.Component", () => {
		it("should construct a roact class", () => {
			class RoactClass extends Roact.Component {
				/* tslint:disable */
				public static _new: unknown;
				/* tslint:enable */

				public render(): Roact.Element {
					return <frame />;
				}
			}

			expect(typeof RoactClass).to.equal("object");
			expect(RoactClass._new).to.be.a("function");
		});

		it("should construct a roact pure component class", () => {
			class RoactPureClass extends Roact.PureComponent {
				/* tslint:disable */
				public static _new: unknown;
				/* tslint:enable */

				public render(): Roact.Element {
					return <frame />;
				}
			}

			expect(typeof RoactPureClass).to.equal("object");
			expect(RoactPureClass._new).to.be.a("function");
		});

		it("should construct default props", () => {
			interface RoactProps {
				value: number;
			}
			class RoactClass extends Roact.Component {
				public static defaultProps: RoactProps = {
					value: 10,
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
				public static getDerivedStateFromProps(nextProps: TestProps, lastState: TestState): TestState {
					return { someValue: nextProps.someValue };
				}

				public render(): Roact.Element {
					return <frame />;
				}
			}

			expect(RoactClass.getDerivedStateFromProps).to.be.a("function");
		});

		it("should mount a roact object", () => {
			class RoactClass extends Roact.Component {
				public render(): Roact.Element {
					return <frame />;
				}
			}

			const handle = Roact.mount(<RoactClass />);
			expect(handle).to.be.a("table");
		});
	});

	it("should create roact intrinsics", () => {
		const RoactIntrinsic = <frame />;
		const RoactIntrinsicManual = Roact.createElement("Frame");

		// Both should be a Frame
		expect(RoactIntrinsic.component).to.equal(RoactIntrinsicManual.component);
	});

	describe("should support all roact property types", () => {
		it("should be able to have keyed children", () => {
			const KEY = "key1";
			const KEY2 = "key2";

			const element = (
				<screengui>
					<frame Key={KEY} />
					<frame Key={KEY2} />
				</screengui>
			);

			const handle = Roact.mount(element);

			const frameKey = handle._children![KEY];
			const frame2Key = handle._children![KEY2];

			expect(frameKey).to.be.ok();
			expect(frame2Key).to.be.ok();
		});

		it("should support props", () => {
			const TEXT = "Hello, World!";
			const propElement = <textbutton Text={TEXT} />;
			const propElementProps = propElement.props as Roact.Properties<TextButton>;

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
						MouseButton1Click: () => {},
					}}
				/>
			);

			const eventElementProps = eventElement.props as UniqueSymbolsForTests;

			expect(eventElementProps[EventHack.MouseButton1Click]).to.be.a("function");
		});

		it("should support [Roact.Change]", () => {
			const eventElement = (
				<textbutton
					Change={{
						AbsoluteSize: () => {},
					}}
				/>
			);
			const eventElementProps = eventElement.props as UniqueSymbolsForTests;
			expect(eventElementProps[ChangeHack.AbsoluteSize]).to.be.a("function");
		});
		describe("should support [Roact.Ref]", () => {
			/*
				These are based basically off the Roact tests.
			*/

			it("should handle object references properly", () => {
				const frameRef: Roact.Ref<Frame> = Roact.createRef<Frame>();

				Roact.mount(<frame Ref={frameRef} />);

				expect(frameRef.current).to.be.ok();
			});

			it("should handle function references properly", () => {
				let currentRbx: Rbx_Frame;

				function ref(rbx: Rbx_Frame) {
					currentRbx = rbx;
				}

				const element = <frame Ref={ref} />;
				const handle = Roact.mount(element);
				expect(currentRbx!).to.be.ok();
			});

			it("should handle class references properly", () => {
				class RoactRefTest extends Roact.Component {
					public ref: Roact.Ref<Rbx_ScreenGui>;

					constructor(p: {}) {
						super(p);
						this.ref = Roact.createRef<ScreenGui>();
					}

					public render(): Roact.Element {
						return <screengui Ref={this.ref} />;
					}

					public didUpdate() {
						expect(this.ref.current).to.be.ok();
					}
				}

				Roact.mount(<RoactRefTest />);
			});

			it("should handle class function references properly", () => {
				let worked = false;
				class RoactRefTest extends Roact.Component {
					public onScreenGuiRender(rbx: Rbx_ScreenGui) {
						worked = true;
					}
					public render(): Roact.Element {
						return <screengui Ref={this.onScreenGuiRender} />;
					}
				}

				Roact.mount(<RoactRefTest />);
				expect(worked).to.be.ok();
			});
		});
	});

	it("should be able to mount roact intrinsics", () => {
		const handle = Roact.mount(<screengui />);
		expect(handle._rbx!.ClassName).to.equal("ScreenGui");
	});

	it("should be able to have Roact.Element[] expressions", () => {
		const test = [<frame Key="One" />, <frame Key="Two" />];

		const test2 = (
			<screengui>
				{test}
				<frame Key="Three" />
			</screengui>
		);

		const handle = Roact.mount(test2);
		expect(handle._rbx!.FindFirstChild("One")).to.be.ok();
		expect(handle._rbx!.FindFirstChild("Two")).to.be.ok();
		expect(handle._rbx!.FindFirstChild("Three")).to.be.ok();
	});

	it("should be able to use Roact.Element[] expressions inside classes", () => {
		class TestComponent extends Roact.Component {
			public render(): Roact.Element {
				const innerFrames = [<frame Key="Frame1" />, <frame Key="Frame2" />];

				return <frame>{innerFrames}</frame>;
			}
		}

		const test = <TestComponent />;

		const handle = Roact.mount(test);
		const returned = handle._child;

		// expect the returned child to be a frame
		expect(returned!._rbx!.IsA("Frame")).to.be.ok();
		expect(returned!._rbx!.FindFirstChild("Frame1")).to.be.ok();
		expect(returned!._rbx!.FindFirstChild("Frame2")).to.be.ok();
	});

	it("should allow using results from functions in expressions", () => {
		function multipleElements(): Array<Roact.Element> {
			return [<frame Key="Frame57" />, <frame Key="Frame103" />];
		}

		const test = <screengui>{multipleElements()}</screengui>;

		const handle = Roact.mount(test);
		expect(handle._rbx!.FindFirstChild("Frame57")).to.be.ok();
		expect(handle._rbx!.FindFirstChild("Frame103")).to.be.ok();
	});

	it("should be able to use this.props[Roact.Children] expressions", () => {
		class TestComponent extends Roact.Component {
			constructor() {
				super({});
			}
			public render(): Roact.Element {
				return <frame>{this.props[Roact.Children]}</frame>;
			}
		}

		const test = (
			<TestComponent>
				<textlabel Key="TextLabel20" />
			</TestComponent>
		);

		const handle = Roact.mount(test);
		const returned = handle._child;

		// expect the returned child to be a frame
		expect(returned!._rbx!.IsA("Frame")).to.be.ok();

		// expect there to be a textlabel called "Hello"
		expect(returned!._rbx!.FindFirstChildOfClass("TextLabel")).to.be.ok();
		expect(returned!._rbx!.FindFirstChild("TextLabel20")).to.be.ok();
	});
};
