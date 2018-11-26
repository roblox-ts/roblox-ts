import * as Roact from "rbx-roact";

class RoactClass extends Roact.Component {
    public render(): Roact.Element {
        return <rbxFrame/>;
    }
}

export = () => {

    const RoactClassInstance = <RoactClass/>;
    const RoactClassManual = Roact.createElement("RoactClass");
    const RoactIntrinsic = <rbxFrame/>;
    const RoactIntrinsicManual = Roact.createElement("Frame");

	it("should create roact class instances", () => {

        // Roact has a "component" property in it. Both should be "Frame".
        expect(RoactClassInstance.component).to.equal(RoactClassManual.component);
    });

    it("should create roact intrinsics", () => {
        expect(RoactIntrinsic.component).to.equal(RoactIntrinsicManual.component);
    });
}