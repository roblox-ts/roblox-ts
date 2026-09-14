declare const obj: { [key: string]: number };

// private identifier as a destructuring property name -> objectAccessor isPrivateIdentifier branch
const { #x: value } = obj;

export = value;
