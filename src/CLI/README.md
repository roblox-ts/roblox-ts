# roblox-ts CLI

This handles the command line interface (CLI) entry point for roblox-ts.

The CLI should create TSProject instances as needed based on input from the user.

Only behavior unique to CLI environments should go here. Any behavior that is common to both the CLI and the playground environments belongs in TSProject.


## Structure

**commands/** - stores all of the yargs-based subcommands for the cli interface

**commands/build.ts** - the `build` command, this runs by default and can have the following flags:

- `--project, -p` - Location of the tsconfig.json or folder containing the tsconfig.json *(defaults to ".")*
- `--watch, -w` - Enable watch mode, recompiles files as they change. Creates a Watcher object. *(defaults to false)*
- `--includePath, -i` - Path to where the runtime library files should be stored. *(defaults to "include")*
- `--rojo` - Path to the Rojo configuration file. By default this will attempt to find a *.project.json in your project folder.

**commands/init.ts** - the `init` command, used to create projects from templates

Has the following sub commands:
- `game, place` - create a project to build a Roblox place
- `model` - create a project to build a Roblox model
- `plugin` - create a project to build a Roblox Studio plugin
- `package` - create a project to build an npm package

**modules/** - stores various classes related to running CLI processes

**modules/Watcher.ts** - used for executing "watch" mode, will recreate TSProject instances as needed when Rojo/TS config files change.

**modules/Initializer.ts** - used to create projects from templates using the `init` command.

**cli.ts** - used to kickstart yargs
