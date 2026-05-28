#!/usr/bin/env bun
import { Command } from "commander";
import { readFileSync } from "fs";
import { createAuthCommand } from "./commands/auth";
import { createConfigCommand } from "./commands/config";
import { createDraftCommand } from "./commands/draft";
import { createPostsCommand } from "./commands/posts";
import { createProfileCommand } from "./commands/profile";
import { createPublishCommand } from "./commands/publish";
import { createThreadCommand } from "./commands/thread";

const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf-8")
);

const program = new Command();

program
  .name("threads")
  .description("CLI for publishing and analyzing Threads posts")
  .version(version);

program.addCommand(createAuthCommand());
program.addCommand(createConfigCommand());
program.addCommand(createDraftCommand());
program.addCommand(createPostsCommand());
program.addCommand(createProfileCommand());
program.addCommand(createPublishCommand());
program.addCommand(createThreadCommand());

program.parse();
