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
    _children?: AnyHandleElementKind[];
}

export = () => {
    describe("should support Roact.Component", () => {
        it("should construct a roact class", () => {
            class RoactClass extends Roact.Component {
                // Hack in Roact._new
                static _new: any;
    
                public render(): Roact.Element {
                    return <rbxFrame />;
                }
            }
    
            expect(typeof RoactClass).to.equal("object");
            expect(RoactClass._new).to.be.a("function");
        });
    
        it("should mount a roact object", () => {
            class RoactClass extends Roact.Component {
                // Hack in Roact._new
                static _new: any;
    
                public render(): Roact.Element {
                    return <rbxFrame />;
                }
            }
    
            let handle = Roact.mount(<RoactClass />);
            expect(handle).to.be.a("table");
        });
    });



    it("should create roact intrinsics", () => {
        const RoactIntrinsic = <rbxFrame />;
        const RoactIntrinsicManual = Roact.createElement("Frame");

        // Both should be a Frame
        expect(RoactIntrinsic.component).to.equal(RoactIntrinsicManual.component);
    });

    describe("should support all roact property types", () => {

        it("should be able to have keyed children", () => {
            const KEY = "key1";
            const KEY2 = "key2";

            let element = <rbxScreenGui>
                <rbxFrame Key={KEY} />
                <rbxFrame Key={KEY2} />
            </rbxScreenGui>;

            let handle: any = Roact.mount(element);

            let frameKey = handle._children[KEY];
            let frame2Key = handle._children[KEY2];

            expect(frameKey).to.be.ok();
            expect(frame2Key).to.be.ok();
        });

        it("should support props", () => {
            const TEXT = "Hello, World!";
            const propElement = <rbxTextButton Text={TEXT} />;

            expect(propElement.props.Text).to.equal(TEXT);
        });

        it("should support [Roact.Event]", () => {
            const eventElement = <rbxTextButton Event={{
                MouseButton1Click: () => { }
            }} />;

            expect(eventElement.props[Roact.Event.MouseButton1Click]).to.be.a("function");
        });

        it("should support [Roact.Change]", () => {
            const eventElement = <rbxTextButton Change={{
                AbsoluteSize: () => { }
            }} />;

            expect(eventElement.props[Roact.Change.AbsoluteSize]).to.be.a("function");
        });

    });


    it("should be able to mount roact intrinsics", () => {
        let handle: PrimitiveHandleElementKind = Roact.mount(<rbxScreenGui />);
        expect(handle._rbx!.ClassName).to.equal("ScreenGui");
    });
}