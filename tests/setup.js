import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

const testDbPath = path.join(os.tmpdir(), `wgui-test-${Date.now()}.db`)
process.env.DB_PATH = testDbPath
process.env.SESSION_SECRET = 'test-secret-for-vitest'

afterAll(() => {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(testDbPath + suffix) } catch (e) {}
  }
})
