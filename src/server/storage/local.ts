import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

import { assertSafeKey, type Storage } from "./types"

// Penyimpanan di folder lokal (development). Jenis file disimpan di file pendamping .type.
export function localStorage(root: string): Storage {
  const fullPath = (key: string) => {
    assertSafeKey(key)
    return path.join(path.resolve(root), key)
  }
  return {
    async put(key, body, contentType) {
      const target = fullPath(key)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, body)
      await writeFile(`${target}.type`, contentType)
    },
    async get(key) {
      const target = fullPath(key)
      try {
        const [body, contentType] = await Promise.all([
          readFile(target),
          readFile(`${target}.type`, "utf8").catch(() => "application/octet-stream"),
        ])
        return { body: new Uint8Array(body), contentType }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
        throw error
      }
    },
    async delete(key) {
      const target = fullPath(key)
      await rm(target, { force: true })
      await rm(`${target}.type`, { force: true })
    },
  }
}
