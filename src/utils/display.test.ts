import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { EventEmitter } from "events";
import { confirm } from "./display";

describe("confirm", () => {
  const originalStdin = Object.getOwnPropertyDescriptor(process, "stdin")!;
  let fakeStdin: EventEmitter & { setRawMode?: () => void };

  beforeEach(() => {
    // Suppress the prompt so it doesn't pollute test output.
    spyOn(process.stdout, "write").mockImplementation(() => true);
    fakeStdin = new EventEmitter() as EventEmitter & { setRawMode?: () => void };
    fakeStdin.setRawMode = () => {};
    Object.defineProperty(process, "stdin", { value: fakeStdin, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process, "stdin", originalStdin);
    spyOn(process.stdout, "write").mockRestore();
  });

  // The regression this guards: piped/closed stdin emits "end" with no data; without an
  // "end" listener confirm() hangs forever.
  test("resolves false when stdin closes without input", async () => {
    const result = confirm("Delete?");
    fakeStdin.emit("end");
    expect(await result).toBe(false);
    // Listeners are removed on resolve so the stream isn't kept alive.
    expect(fakeStdin.listenerCount("data")).toBe(0);
    expect(fakeStdin.listenerCount("end")).toBe(0);
  });

  test("resolves true on 'y' / 'yes' input", async () => {
    const result = confirm("Delete?");
    fakeStdin.emit("data", Buffer.from("Y\n"));
    expect(await result).toBe(true);
  });

  test("resolves false on any other input", async () => {
    const result = confirm("Delete?");
    fakeStdin.emit("data", Buffer.from("n\n"));
    expect(await result).toBe(false);
  });
});
