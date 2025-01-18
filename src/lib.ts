import { spawn } from "node:child_process"

export const isObject = (x: unknown): x is Record<PropertyKey, unknown> =>
  !!x && Object.getPrototypeOf(x) === Object.prototype

export const cli = (
  [cmd, ...args]: readonly string[],
  signal?: AbortSignal,
): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "pipe" })

    let out = ""
    let err = ""
    p.stdout.on("data", (data: string) => (out += data))
    p.stderr.on("data", (data: string) => (err += data))

    signal?.addEventListener("abort", () => {
      p.kill()
      reject(new Error(JSON.stringify(signal.reason)))
    })

    p.once("error", reject)
    p.once("close", code => {
      if (code === 0) {
        resolve(out)
      } else {
        reject(new Error(err))
      }
    })
  })
