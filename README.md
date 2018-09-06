# roblox-ts

<center>⚠️ Documentation is a work in progress. ⚠️</center>

## **Quickstart Guide**

### **Installation**
You can install roblox-ts with npm, simply just:\
`npm install -g roblox-ts`\
(some systems may require you to prefix this with `sudo`)\
You can then use roblox-ts via the CLI command `rbxtsc`.

### **Command Line Options**
The `rbxtsc` command has a few flags you can use with it
```
Options:
  -w, --watch        enable watch mode                                 [boolean]
  -p, --project      project path                                 [default: "."]
  -i, --includePath  path of folder to copy runtime .lua files to     [required]
  -v, --version      show version information                          [boolean]
  -h, --help         show help                                         [boolean]
```

The `--includePath` flag is required for compiling.\
You should provide it a path to the folder you want to use for the included runtime library files.\
This path should sync into studio as a folder at `game.ReplicatedStorage.RobloxTS`.


### **Syncing Files into Roblox Studio**
We recommend you use a tool like [Rojo](https://github.com/LPGhatguy/rojo) or [rofresh](https://github.com/osyrisrblx/rofresh) to sync your compiled .lua files into studio.


## **Join the community!**
https://discord.gg/f6Rn6RY
