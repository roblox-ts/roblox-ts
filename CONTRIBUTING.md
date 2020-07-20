# Contributing

Thank you for your interest in contributing to **roblox-ts**!

## Getting Started

First, we'll need to setup the development build of **roblox-ts**.

This guide assumes you have the following installed:

-   Git
-   NodeJS
-   NPM

We'll also assume you understand some basic terminal navigation commands (`cd`, `ls`/`dir`, etc.).

1. Begin by creating a fork of roblox-ts.

![https://i.imgur.com/wRtbuiy.png](https://i.imgur.com/wRtbuiy.png)

2. Navigate to somewhere you'd like to keep your development copy of **roblox-ts** and then you can run the following commands:

```sh
# Clone your fork of roblox-ts (you may prefer to use SSH instead)
git clone https://github.com/YOUR_GITHUB_USERNAME/roblox-ts.git
# Navigate into the roblox-ts folder
cd roblox-ts
# Checkout the refactor branch
git checkout refactor
# Install dependency packages (node_modules)
npm install
# build the compiler
npm run build
# link
npm run devlink
```

3. You should now be able to use the command `rbxtsc-dev` to run the development compiler!

4. At a later time, if you need to update it:

```sh
# pull latest changes
git pull
# build the compiler
npm run build
```

It is not necessary to run the "devlink" script again.

## Unit Testing

**roblox-ts** keeps a suite of automated unit tests inside of `/tests`.

Effectively, this folder is a tiny **roblox-ts** game. Testing process is as follows:

1. Compile tests project to create a `/tests/out` folder containing `.lua` files
2. Use `rojo build` to create `/tests/test.rbxlx`
3. Use `run-in-roblox` to open studio and execute the tests

You can run this process yourself if you have Roblox Studio and [foreman](https://github.com/Roblox/foreman) installed. (Only works on Windows and MacOS)

```sh
# install rojo + run-in-roblox
foreman install
# Compile tests, build .rbxlx, run with run-in-roblox
npm test
```

Unfortunately, Roblox Studio requires authentication to run our tests. You will need to provide a `.ROBLOSECURITY` cookie in your fork to allow tests.\
It is _highly_ recommended that you create a brand new Roblox account that is only used for this.

You can find your `.ROBLOSECURITY` token in the Chrome developer tools. (Ctrl+Shift+I)

![https://i.imgur.com/xSiR6tX.png](https://i.imgur.com/xSiR6tX.png)

1. Create a new Roblox account in Chrome's "Incognito" mode
2. Open Chrome Developer Tools with Ctrl+Shift+I
3. Click on `Application`
4. Click on `Cookies` > `https://www.roblox.com`
5. Select `.ROBLOSECURITY` from the "Name" column
6. Copy the value
7. **DO NOT LOG OUT**, this will invalidate your `.ROBLOSECURITY` cookie. Instead, just close out of the browser tab.

Next, go to your fork repository settings on GitHub.

![https://i.imgur.com/gabFmIa.png](https://i.imgur.com/gabFmIa.png)

1. Click on `Settings`
2. Click on `Secrets`
3. Click on `New secret`
4. Set `Name` to `ROBLOSECURITY`
5. Paste your `.ROBLOSECURITY` cookie value into `Value`
6. Click on `Add secret`
