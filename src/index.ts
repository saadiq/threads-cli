#!/usr/bin/env bun
import { Command } from "commander";

const program = new Command();

program
  .name("threads")
  .description("CLI for publishing and analyzing Threads posts")
  .version("0.1.0");

program.parse();
