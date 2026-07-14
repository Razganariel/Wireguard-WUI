const Tokens = require('csrf')
const log = require('../helpers/logger')

const tokens = new Tokens()

function csrfMiddleware(req, res, next) {
  if (!req.session.csrfSecret) {
    req.session.csrfSecret = tokens.secretSync()
  }

  res.locals.csrfToken = tokens.create(req.session.csrfSecret)

  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
    const csrfBody = req.body._csrf
    if (!csrfBody || !tokens.verify(req.session.csrfSecret, csrfBody)) {
      log.debug('CSRF', `Échec validation CSRF — ${req.method} ${req.path}`)
      req.session.flash = { error: req.t('error.invalid_session') }
      return res.redirect('/')
    }
    log.debug('CSRF', `Validation OK — ${req.method} ${req.path}`)
  }

  next()
}

module.exports = csrfMiddleware