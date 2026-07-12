const Tokens = require('csrf')

const tokens = new Tokens()

function csrfMiddleware(req, res, next) {
  if (!req.session.csrfSecret) {
    req.session.csrfSecret = tokens.secretSync()
  }

  res.locals.csrfToken = tokens.create(req.session.csrfSecret)

  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
    const csrfBody = req.body._csrf
    if (!csrfBody || !tokens.verify(req.session.csrfSecret, csrfBody)) {
      req.session.flash = { error: 'Session invalide. Veuillez réessayer.' }
      return res.redirect('/')
    }
  }

  next()
}

module.exports = csrfMiddleware