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

export async function confirm(message: string): Promise<boolean> {
  process.stdout.write(`${message} [y/N] `);

  const response = await new Promise<string>((resolve) => {
    let data = "";
    process.stdin.setRawMode?.(false);
    process.stdin.once("data", (chunk) => {
      data = chunk.toString().trim().toLowerCase();
      resolve(data);
    });
  });

  return response === "y" || response === "yes";
}
