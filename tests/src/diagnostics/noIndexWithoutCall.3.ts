const array = [1, 2, 3];
const { push } = array;
const otherArray = [1, 2];
otherArray.push = push;
otherArray.push();
