import Roact from "@rbxts/roact";

export default class JsxMethodDeclarationCallbackProperty extends Roact.Component {
	public refMethod(ref: Frame) {}

	public render() {
		return <frame Ref={this.refMethod} />;
	}
}
