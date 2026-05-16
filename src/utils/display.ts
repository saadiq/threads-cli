export function displayPreview(content: string, imageUrl?: string): void {
  const width = 60;
  const border = "─".repeat(width);

  console.log(`┌${border}┐`);
  console.log(`│ Preview${" ".repeat(width - 8)}│`);
  console.log(`├${border}┤`);

  // Wrap content
  const lines = content.split("\n");
  for (const line of lines) {
    const chunks = chunkString(line, width - 2);
    for (const chunk of chunks) {
      console.log(`│ ${chunk.padEnd(width - 2)}│`);
    }
  }

  if (imageUrl) {
    console.log(`│${" ".repeat(width)}│`);
    console.log(`│ Image: ${imageUrl.slice(0, width - 10).padEnd(width - 2)}│`);
  }

  console.log(`│${" ".repeat(width)}│`);
  console.log(
    `│ Characters: ${content.length} / 500${" ".repeat(width - 22 - String(content.length).length)}│`
  );
  console.log(`└${border}┘`);
}

function chunkString(str: string, length: number): string[] {
  if (str.length <= length) return [str];
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += length) {
    chunks.push(str.slice(i, i + length));
  }
  return chunks;
}

export async function readSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    // Non-TTY fallback: read line without masking
    process.stdout.write(prompt);
    const buf = await new Promise<Buffer>((resolve) => {
      process.stdin.once("data", (data: Buffer) => resolve(data));
    });
    return buf.toString().trimEnd();
  }

  // TTY: read with asterisk masking
  process.stdout.write(prompt);

  return new Promise<string>((resolve) => {
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();

    const buf: string[] = [];

    const handler = (char: Buffer) => {
      const str = char.toString();

      switch (str) {
        case "\r":
        case "\n":
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", handler);
          process.stdout.write("\n");
          resolve(buf.join(""));
          break;
        case "\x7f":
        case "\b":
          if (buf.length > 0) {
            buf.pop();
            process.stdout.write("\b \b");
          }
          break;
        case "\x03":
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", handler);
          process.stdout.write("^C\n");
          process.exit(1);
          break;
        default:
          buf.push(str);
          process.stdout.write("*");
          break;
      }
    };

    stdin.on("data", handler);
  });
}

export async function confirm(message: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    // Non-TTY (CI, pipes): cannot prompt, default to false
    console.log(`${message} [y/N] N (non-interactive)`);
    return false;
  }

  process.stdout.write(`${message} [y/N] `);

  return await new Promise<boolean>((resolve) => {
    process.stdin.setRawMode?.(false);
    process.stdin.once("data", (chunk: Buffer) => {
      const response = chunk.toString().trim().toLowerCase();
      resolve(response === "y" || response === "yes");
    });
  });
}
