declare const callback: never;
const object = { method() {} };
// @ts-ignore
callback(object.method);
