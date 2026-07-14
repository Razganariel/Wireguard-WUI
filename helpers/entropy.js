// SPDX-License-Identifier: AGPL-3.0-only

function calculateEntropy(password) {
  if (!password) return 0
  let pool = 0
  if (/[a-z]/.test(password)) pool += 26
  if (/[A-Z]/.test(password)) pool += 26
  if (/[0-9]/.test(password)) pool += 10
  if (/[^a-zA-Z0-9]/.test(password)) pool += 33
  if (pool === 0) return 0
  return Math.round(password.length * Math.log2(pool) * 10) / 10
}

function getStrength(password) {
  const entropy = calculateEntropy(password)
  let label = 'Faible'
  let variant = 'danger'
  if (entropy >= 80) { label = 'Très fort'; variant = 'success' }
  else if (entropy >= 60) { label = 'Fort'; variant = 'success' }
  else if (entropy >= 40) { label = 'Moyen'; variant = 'warning' }
  return { entropy, label, variant, isValid: entropy >= 60 }
}

module.exports = { calculateEntropy, getStrength }