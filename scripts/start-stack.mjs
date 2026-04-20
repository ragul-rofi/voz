import { spawn } from "node:child_process";

const services = [
  { name: "api", command: "pnpm", args: ["start:api"] },
  { name: "web", command: "pnpm", args: ["start:web"] },
  { name: "worker", command: "pnpm", args: ["start:worker"] },
  { name: "ws", command: "pnpm", args: ["start:ws"] },
];

const children = [];
let shuttingDown = false;

function prefixWrite(name, chunk, stream = "log") {
  const lines = chunk.toString("utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line) {
      continue;
    }
    const prefixed = `[${name}] ${line}\n`;
    if (stream === "error") {
      process.stderr.write(prefixed);
    } else {
      process.stdout.write(prefixed);
    }
  }
}

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  for (const child of children) {
    child.kill("SIGTERM");
  }

  setTimeout(() => {
    for (const child of children) {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }
    process.exit(code);
  }, 2500).unref();
}

for (const service of services) {
  const child = spawn(service.command, service.args, {
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV ?? "production",
    },
  });

  child.stdout.on("data", (chunk) => prefixWrite(service.name, chunk, "log"));
  child.stderr.on("data", (chunk) => prefixWrite(service.name, chunk, "error"));

  child.on("exit", (code) => {
    if (!shuttingDown) {
      const exitCode = typeof code === "number" ? code : 1;
      const message = `[${service.name}] exited with code ${exitCode}; stopping remaining services.\n`;
      process.stderr.write(message);
      shutdown(exitCode);
    }
  });

  child.on("error", (error) => {
    process.stderr.write(`[${service.name}] failed to start: ${error.message}\n`);
    shutdown(1);
  });

  children.push(child);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
