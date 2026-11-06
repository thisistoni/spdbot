import { access, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { strictJSON } from "./purchase-wire.mjs";

export function createPurchaseStore(file, encryption) {
  let queue = Promise.resolve();
  const journal = `${file}.pending`;
  const available = async () => {
    if (!(await encryption.available())) throw new Error("secure_storage_unavailable");
  };
  return {
    async read() {
      await queue;
      try { await access(journal); throw new Error("access_storage_corrupt"); }
      catch (error) { if (error.code !== "ENOENT") throw new Error("access_storage_corrupt"); }
      await available();
      let data;
      try { data = await readFile(file); }
      catch (error) { if (error.code === "ENOENT") return null; throw new Error("access_storage_corrupt"); }
      try {
        if (data.length > 131072) throw new Error();
        const decrypted = await encryption.decrypt(data);
        return strictJSON(typeof decrypted === "string" ? decrypted : decrypted?.result, 65536);
      } catch { throw new Error("access_storage_corrupt"); }
    },
    write(record) {
      const operation = queue.then(async () => {
        await mkdir(dirname(file), { recursive: true });
        const pending = await open(journal, "w", 0o600);
        try { await pending.writeFile("access-write-in-progress-v1"); await pending.sync(); } finally { await pending.close(); }
        await available();
        const data = await encryption.encrypt(JSON.stringify(record));
        const temporary = `${file}.${randomUUID()}.tmp`;
        let handle;
        try {
          handle = await open(temporary, "wx", 0o600);
          await handle.writeFile(data);
          await handle.sync();
          await handle.close(); handle = null;
          await rename(temporary, file);
          // Windows does not support fsync of directories; the encrypted file was flushed before rename.
          if (process.platform !== "win32") {
            const directory = await open(dirname(file), "r");
            try { await directory.sync(); } finally { await directory.close(); }
          }
          await unlink(journal);
        } finally {
          await handle?.close();
          await unlink(temporary).catch(() => {});
        }
      });
      queue = operation.catch(() => {});
      return operation;
    },
    clear() {
      const operation = queue.then(async () => {
        await unlink(file).catch(error => { if (error.code !== "ENOENT") throw error; });
        await unlink(journal).catch(error => { if (error.code !== "ENOENT") throw error; });
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}
