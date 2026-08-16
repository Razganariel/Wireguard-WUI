// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as logger from '../../helpers/logger.js'
import settingsModel from '../../models/settings.js'

const LOG_FILE = process.env.LOG_FILE

function appendLine(timestamp, level, module, message) {
  fs.appendFileSync(LOG_FILE, `[${timestamp}] [${level}] [${module}] ${message}\n`, 'utf8')
}

function entriesContaining(token) {
  return logger.readLogs({ limit: 100 }).entries.filter((e) => e.message.includes(token))
}

let nextToken = 0

function token(label) {
  nextToken += 1
  return `logger-test-${nextToken}-${label}`
}

beforeEach(() => {
  fs.writeFileSync(LOG_FILE, '', 'utf8')
  const base = LOG_FILE.replace(/\.log$/, '')
  for (let i = 1; i <= 20; i += 1) {
    try { fs.unlinkSync(`${base}.${i}.log`) } catch (e) {}
  }
})

describe('readLogs', () => {
  it('returns no entries when the log file does not exist', () => {
    const original = process.env.LOG_FILE
    process.env.LOG_FILE = path.join(os.tmpdir(), `wgui-missing-${Date.now()}.log`)
    const { entries, modules, total } = logger.readLogs({ limit: 100 })
    expect(entries).toEqual([])
    expect(modules).toEqual([])
    expect(total).toBe(0)
    process.env.LOG_FILE = original
  })

  it('parses lines and exposes available modules', () => {
    const t = token('parse')
    appendLine('2026-08-16 10:00:00.000', 'INFO', 'Auth', `${t} connexion ok`)
    appendLine('2026-08-16 10:00:01.000', 'ERROR', 'Sudo', `${t} echec commande`)
    const { entries, modules, total } = logger.readLogs({ limit: 100 })
    expect(modules).toEqual(['Auth', 'Sudo'])
    expect(total).toBe(2)
    const matches = entries.filter((e) => e.message.includes(t))
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

    const byLevel = logger.readLogs({ level: 'ERROR', limit: 100 })
    expect(byLevel.entries).toHaveLength(1)
    expect(byLevel.entries[0].module).toBe('Sudo')
    expect(byLevel.total).toBe(1)

    const byModule = logger.readLogs({ module: 'Peers', limit: 100 })
    expect(byModule.entries).toHaveLength(1)
    expect(byModule.entries[0].level).toBe('INFO')

    const bySearch = logger.readLogs({ search: 'ajout pair', limit: 100 })
    expect(bySearch.entries).toHaveLength(1)
    expect(bySearch.entries[0].module).toBe('Peers')
  })

  it('respects the limit and returns the most recent entries', () => {
    const t = token('lot')
    for (let i = 0; i < 5; i += 1) {
      appendLine(`2026-08-16 10:10:0${i}.000`, 'INFO', 'HTTP', `${t} lot ${i}`)
    }
    const { entries, total } = logger.readLogs({ limit: 2 })
    const matches = entries.filter((e) => e.message.includes(t))
    expect(matches).toHaveLength(2)
    expect(matches[0].message.endsWith('lot 3')).toBe(true)
    expect(matches[1].message.endsWith('lot 4')).toBe(true)
    expect(total).toBe(5)
  })

  it('keeps the full module list regardless of active filters', () => {
    const t = token('modules')
    appendLine('2026-08-16 10:00:04.000', 'INFO', 'Auth', `${t} ok`)
    appendLine('2026-08-16 10:00:05.000', 'ERROR', 'Sudo', `${t} fail`)
    const { modules, entries } = logger.readLogs({ level: 'ERROR', limit: 100 })
    expect(modules).toEqual(['Auth', 'Sudo'])
    const matches = entries.filter((e) => e.message.includes(t))
    expect(matches).toHaveLength(1)
    expect(matches[0].module).toBe('Sudo')
  })

  it('ignores malformed lines', () => {
    const t = token('ignored')
    appendLine('cette ligne nest pas un log', 'INFO', 'HTTP', `${t} ignore`)
    expect(entriesContaining(t)).toHaveLength(0)
  })

  it('rotates automatically when the log exceeds the configured size', () => {
    settingsModel.set('log_rotate_size', '1')
    settingsModel.set('log_rotate_backups', '2')
    logger.invalidateCache()
    const base = LOG_FILE.replace(/\.log$/, '')
    const t = token('autorot')
    const big = 'y'.repeat(700)
    for (let i = 0; i < 20; i += 1) {
      logger.info('Serveur', `${t} ligne ${i} ${big}`)
    }

    expect(fs.existsSync(`${base}.1.log`)).toBe(true)
    expect(fs.existsSync(`${base}.2.log`)).toBe(true)
    expect(fs.existsSync(`${base}.3.log`)).toBe(false)
    const current = fs.readFileSync(LOG_FILE, 'utf8')
    expect(current).toContain(`${t} ligne 19`)
    expect(fs.statSync(LOG_FILE).size).toBeLessThan(2048)
  })

  it('shifts and caps backup files on successive rotations', () => {
    settingsModel.set('log_rotate_size', '1')
    settingsModel.set('log_rotate_backups', '2')
    logger.invalidateCache()
    const base = LOG_FILE.replace(/\.log$/, '')

    appendLine('2026-08-16 10:00:00.000', 'INFO', 'Serveur', 'x'.repeat(1200))
    logger.rotateLogs()
    expect(fs.existsSync(`${base}.1.log`)).toBe(true)
    expect(fs.statSync(LOG_FILE).size).toBe(0)

    appendLine('2026-08-16 10:00:01.000', 'INFO', 'Serveur', 'y'.repeat(1200))
    logger.rotateLogs()
    expect(fs.existsSync(`${base}.1.log`)).toBe(true)
    expect(fs.existsSync(`${base}.2.log`)).toBe(true)
    expect(fs.readFileSync(`${base}.2.log`, 'utf8')).toContain('x'.repeat(1200))
    expect(fs.readFileSync(`${base}.1.log`, 'utf8')).toContain('y'.repeat(1200))

    appendLine('2026-08-16 10:00:02.000', 'INFO', 'Serveur', 'z'.repeat(1200))
    logger.rotateLogs()
    expect(fs.existsSync(`${base}.1.log`)).toBe(true)
    expect(fs.existsSync(`${base}.2.log`)).toBe(true)
    expect(fs.existsSync(`${base}.3.log`)).toBe(false)
  })

  it('does not rotate when size is set to 0 (disabled)', () => {
    settingsModel.set('log_rotate_size', '0')
    settingsModel.set('log_rotate_backups', '2')
    logger.invalidateCache()
    const t = token('norot')
    for (let i = 0; i < 10; i += 1) {
      logger.info('Serveur', `${t} ligne ${i} ${'z'.repeat(300)}`)
    }
    const content = fs.readFileSync(LOG_FILE, 'utf8')
    const matches = content.split('\n').filter((l) => l.includes(t))
    expect(matches).toHaveLength(10)
    expect(fs.existsSync(`${LOG_FILE.replace(/\.log$/, '')}.1.log`)).toBe(false)
  })
})