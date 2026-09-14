function nonTupleTarget<T>(this: [T] extends T ? never : T) {}

function twoCheckElements<T>(this: [T, number] extends [void, T] ? never : T) {}

function twoTargetElements<T>(this: [T] extends [defined, T?] ? never : T) {}
