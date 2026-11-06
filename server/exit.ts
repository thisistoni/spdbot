// On Linux a pipe takes writes asynchronously, so `process.exit` right after `console.error` can drop that line; a write
// callback fires only once its data is out.
export function exitAfterFlush(code: number, { force = true } = {}): void {
  process.exitCode = code;
  const flushed = (stream: NodeJS.WriteStream) => new Promise<void>((done) => stream.write("", () => done()));
  // Finite HTTP commands let native handles close naturally. Forced exit can race
  // Node/libuv teardown on Windows even after both output streams have flushed.
  void Promise.all([flushed(process.stdout), flushed(process.stderr)]).then(() => { if (force) process.exit(code); });
}
