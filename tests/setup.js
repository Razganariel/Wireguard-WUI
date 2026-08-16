// SPDX-License-Identifier: AGPL-3.0-only

import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

const testDbPath = path.join(os.tmpdir(), `wgui-test-${process.pid}-${Date.now()}.db`)
process.env.DB_PATH = testDbPath
process.env.SESSION_SECRET = 'test-secret-for-vitest'
process.env.LOG_FILE = path.join(os.tmpdir(), `wgui-test-${process.pid}-${Date.now()}.log`)

afterAll(() => {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(testDbPath + suffix) } catch (e) {}
  }
  const logBase = process.env.LOG_FILE.replace(/\.log$/, '')
  for (let i = 1; i <= 20; i += 1) {
    try { fs.unlinkSync(`${logBase}.${i}.log`) } catch (e) {}
  }
  try { fs.unlinkSync(process.env.LOG_FILE) } catch (e) {}
})
