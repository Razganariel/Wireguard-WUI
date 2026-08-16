// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { readLogs } from '../../helpers/logger.js'

const LOG_DIR = path.resolve('./logs')
const LOG_FILE = path.join(LOG_DIR, 'app.log')

function appendLine(timestamp, level, module, message) {
  fs.appendFileSync(LOG_FILE, `[${timestamp}] [${level}] [${module}] ${message}\n`, 'utf8')
}

function entriesContaining(token) {
  return readLogs({ limit: 100 }).entries.filter((e) => e.message.includes(token))
}

const TOKENS = []

function token(label) {
  const value = `logger-test-${Date.now()}-${label}`
  TOKENS.push(value)
  return value
}

beforeEach(() => {
  fs.mkdirSync(LOG_DIR, { recursive: true })
})

afterAll(() => {
  const content = fs.readFileSync(LOG_FILE, 'utf8')
  const kept = content.split('\n').filter((l) => !TOKENS.some((t) => l.includes(t))).join('\n')
  fs.writeFileSync(LOG_FILE, kept, 'utf8')
})

describe('readLogs', () => {
  it('returns no entries when the log file does not exist', () => {
    fs.rmSync(LOG_DIR, { recursive: true, force: true })
    const { entries, modules } = readLogs({ limit: 100 })
    expect(entries).toEqual([])
    expect(modules).toEqual([])
    fs.mkdirSync(LOG_DIR, { recursive: true })
  })

  it('parses lines and exposes available modules', () => {
    const t = token('parse')
    appendLine('2026-08-16 10:00:00.000', 'INFO', 'Auth', `${t} connexion ok`)
    appendLine('2026-08-16 10:00:01.000', 'ERROR', 'Sudo', `${t} echec commande`)
    const { entries, modules } = readLogs({ limit: 100 })
    expect(modules).toContain('Auth')
    expect(modules).toContain('Sudo')
    const matches = entriesContaining(t)
    expect(matches).toHaveLength(2)
    expect(matches[0]).toEqual({
      timestamp: '2026-08-16 10:00:00.000',
      level: 'INFO',
      module: 'Auth',
      message: `${t} connexion ok`
    })
  })

  it('filters by level, module and search', () => {
    const t = token('filtres')
    appendLine('2026-08-16 10:00:02.000', 'INFO', 'Peers', `${t} ajout pair`)
    appendLine('2026-08-16 10:00:03.000', 'ERROR', 'Sudo', `${t} mot de passe invalide`)

    const byLevel = entriesContaining(t).filter((e) => e.level === 'ERROR')
    expect(byLevel).toHaveLength(1)
    expect(byLevel[0].module).toBe('Sudo')

    const byModule = readLogs({ module: 'Peers', limit: 100 }).entries.filter((e) => e.message.includes(t))
    expect(byModule).toHaveLength(1)
    expect(byModule[0].level).toBe('INFO')

    const bySearch = readLogs({ search: 'ajout pair', limit: 100 }).entries.filter((e) => e.message.includes(t))
    expect(bySearch).toHaveLength(1)
    expect(bySearch[0].module).toBe('Peers')
  })

  it('respects the limit and returns the most recent entries', () => {
    const t = token('lot')
    for (let i = 0; i < 5; i += 1) {
      appendLine(`2026-08-16 10:10:0${i}.000`, 'INFO', 'HTTP', `${t} lot ${i}`)
    }
    const { entries } = readLogs({ limit: 2 })
    const matches = entries.filter((e) => e.message.includes(t))
    expect(matches).toHaveLength(2)
    expect(matches[0].message.endsWith('lot 3')).toBe(true)
    expect(matches[1].message.endsWith('lot 4')).toBe(true)
  })

  it('keeps the full module list regardless of active filters', () => {
    const t = token('modules')
    appendLine('2026-08-16 10:00:04.000', 'INFO', 'Auth', `${t} ok`)
    appendLine('2026-08-16 10:00:05.000', 'ERROR', 'Sudo', `${t} fail`)
    const { modules, entries } = readLogs({ level: 'ERROR', limit: 100 })
    expect(modules).toContain('Auth')
    expect(modules).toContain('Sudo')
    const matches = entries.filter((e) => e.message.includes(t))
    expect(matches).toHaveLength(1)
    expect(matches[0].module).toBe('Sudo')
  })

  it('ignores malformed lines', () => {
    const t = token('ignored')
    appendLine('cette ligne nest pas un log', 'INFO', 'HTTP', `${t} ignore`)
    expect(entriesContaining(t)).toHaveLength(0)
  })
})