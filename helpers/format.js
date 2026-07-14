// SPDX-License-Identifier: AGPL-3.0-only

function formatBytes(bytes, t) {
  if (!bytes || bytes === 0) return t ? t('text.zero_bytes') : '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  if (t) {
    const key = ['unit.byte', 'unit.kilobyte', 'unit.megabyte', 'unit.gigabyte', 'unit.terabyte'][i]
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${t(key)}`
  }
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function formatHandshake(ts, t) {
  if (!ts || ts === 0) return null
  const now = Math.floor(Date.now() / 1000)
  const diff = now - ts
  if (t) {
    if (diff < 60) return t('text.just_now')
    if (diff < 3600) return t('text.minutes_ago', { count: Math.floor(diff / 60) })
    if (diff < 86400) return t('text.hours_ago', { count: Math.floor(diff / 3600) })
    return t('text.days_ago', { count: Math.floor(diff / 86400) })
  }
  if (diff < 60) return "à l'instant"
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`
  return `il y a ${Math.floor(diff / 86400)} j`
}

module.exports = { formatBytes, formatHandshake }
