// Product discovery is separate from CLI operations: never mutate a different local app.
type LocalApi = (port: number, path: string) => Promise<{ status: number; body: any }>;

export async function probeLocalProduct(api: LocalApi, port: number, pid?: number): Promise<boolean> {
  try {
    const { status, body } = await api(port, "/api/health");
    return status === 200 && body?.app === "spdbot" && (pid === undefined || body.pid === pid);
  } catch {
    return false;
  }
}

export async function discoverCliPort(options: { command: string; port: number }, argv: string[], env: NodeJS.ProcessEnv, serverUp: (port: number) => Promise<boolean>): Promise<boolean> {
  if (["pair", "sessions", "status", "access"].includes(options.command)) {
    const ports = argv.includes("--port") || env.OMB_PORT ? [options.port] : [8899, 18899, 28899];
    let found: number | undefined;
    for (const port of ports) if (await serverUp(port)) { found = port; break; }
    if (found === undefined) {
      console.error("Kein SPDBot-Server gefunden. Starte SPDBot oder gib seinen Port mit --port an.");
      return false;
    }
    options.port = found;
  }
  return true;
}
