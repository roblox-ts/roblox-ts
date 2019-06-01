import Roact from "@rbxts/roact";

class FailedRoactClass extends Roact.Component<{}, {}> {
	public render(): Roact.Element {
		return <frame/>;
	}
}

// This should not compile.
const value = new FailedRoactClass({});
