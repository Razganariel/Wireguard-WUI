// SPDX-License-Identifier: AGPL-3.0-only

const express = require('express')
const router = express.Router()
const { isAuthenticated } = require('../middlewares/auth')
const asyncHandler = require('../helpers/asyncHandler')
const { readLogs } = require('../helpers/logger')
const { sanitizeInt } = require('../helpers/sanitize')

const LEVELS = ['DEBUG', 'INFO', 'ERROR']

router.use(asyncHandler(isAuthenticated))

router.get('/', asyncHandler(async (req, res) => {
  const level = LEVELS.includes(req.query.level) ? req.query.level : ''
  const module = typeof req.query.module === 'string' ? req.query.module.slice(0, 50) : ''
  const search = typeof req.query.search === 'string' ? req.query.search.slice(0, 200) : ''
  const limitRaw = sanitizeInt(req.query.limit)
  const limit = limitRaw && limitRaw >= 1 && limitRaw <= 1000 ? limitRaw : 200

  const { entries, modules } = readLogs({ level, module, search, limit })

  res.render('logs/index', {
    title: req.t('logs.title'),
    entries,
    modules,
    filters: { level, module, search, limit }
  })
}))

module.exports = router