import * as Roact from "rbx-roact";

interface AnyHandleElementKind extends Roact.ComponentInstanceHandle {
	_key?: string;
	_parent?: Instance;
}

interface StatefulHandleElementKind extends AnyHandleElementKind {
	_element?: any;
	_child?: any;
}

interface FunctionalHandleElementKind extends AnyHandleElementKind {
	_element: any;
	_context: any;
}

interface PrimitiveHandleElementKind extends AnyHandleElementKind {
	_rbx?: Instance;
	_element?: any;
	_context?: any;
	_children?: Array<AnyHandleElementKind>;
}

export = () => {
	describe("should support Roact.Component", () => {
		it("should construct a roact class", () => {
			class RoactClass extends Roact.Component {
				/* tslint:disable */
				public static _new: any;
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
				public static _new: any;
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

			class RoactClass extends Roact.Component<TestState, TestProps> {
				public static getDerivedStateFromProps(nextProps: TestProps, lastState: TestState): TestState {
					return {someValue: nextProps.someValue};
				}

				public render(): Roact.Element {
					return <frame/>;
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

			const element = <screengui>
				<frame Key={KEY} />
				<frame Key={KEY2} />
			</screengui>;

			const handle: any = Roact.mount(element);

			const frameKey = handle._children[KEY];
			const frame2Key = handle._children[KEY2];

			expect(frameKey).to.be.ok();
			expect(frame2Key).to.be.ok();
		});

		it("should support props", () => {
			const TEXT = "Hello, World!";
			const propElement = <textbutton Text={TEXT} />;

			expect(propElement.props.Text).to.equal(TEXT);
		});

		it("should support [Roact.Event]", () => {
			const eventElement = <textbutton Event={{
				MouseButton1Click: () => { },
			}} />;

			expect(eventElement.props[Roact.Event.MouseButton1Click]).to.be.a("function");
		});

		it("should support [Roact.Change]", () => {
			const eventElement = <textbutton Change={{
				AbsoluteSize: () => { },
			}} />;

			expect(eventElement.props[Roact.Change.AbsoluteSize]).to.be.a("function");
		});
		describe("should support [Roact.Ref]", () => {
			/*
				These are based basically off the Roact tests.
			*/

			it("should handle object references properly", () => {
				const frameRef: Roact.Ref<Frame> = Roact.createRef<Frame>();

				Roact.mount(<frame Ref={frameRef}/>);

				expect(frameRef.current).to.be.ok();
			});

			it("should handle function references properly", () => {
				let currentRbx: Rbx_Frame;

				function ref(rbx: Rbx_Frame) {
					currentRbx = rbx;
				}

				const element = <frame Ref={ref}/>;
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
						return <screengui Ref={this.ref}/>;
					}

					public didUpdate() {
						expect(this.ref.current).to.be.ok();
					}
				}

				Roact.mount(<RoactRefTest/>);
			});

			it("should handle class function references properly", () => {
				let worked = false;
				class RoactRefTest extends Roact.Component {
					public onScreenGuiRender(rbx: Rbx_ScreenGui) {
						worked = true;
					}
					public render(): Roact.Element {
						return <screengui Ref={this.onScreenGuiRender}/>;
					}
				}

				Roact.mount(<RoactRefTest/>);
				expect(worked).to.be.ok();
			});
		});
	});

	it("should be able to mount roact intrinsics", () => {
		const handle: PrimitiveHandleElementKind = Roact.mount(<screengui />);
		expect(handle._rbx!.ClassName).to.equal("ScreenGui");
	});
};
