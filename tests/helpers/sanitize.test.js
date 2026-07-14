// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from 'vitest'
import {
  sanitize,
  sanitizeRaw,
  sanitizeInt,
  sanitizePeerName,
  sanitizeInterfaceName,
  sanitizeIp,
  sanitizeCidr,
  sanitizePort,
  sanitizeEndpoint,
  sanitizeEmail,
  sanitizeAllowedIps,
  sanitizeDns
} from '../../helpers/sanitize.js'

describe('sanitize', () => {
  it('trims and strips low chars', () => {
    expect(sanitize('  hello  ')).toBe('hello')
  })

  it('escapes HTML', () => {
    expect(sanitize('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;&#x2F;script&gt;')
  })

  it('strips low chars', () => {
    expect(sanitize('a\x00b\x01c')).toBe('abc')
  })

  it('truncates long strings', () => {
    const long = 'a'.repeat(300)
    expect(sanitize(long).length).toBe(255)
  })

  it('returns empty for non-string', () => {
    expect(sanitize(null)).toBe('')
    expect(sanitize(undefined)).toBe('')
    expect(sanitize(123)).toBe('')
  })
})

describe('sanitizeRaw', () => {
  it('trims without escaping', () => {
    expect(sanitizeRaw('  hello world  ')).toBe('hello world')
  })

  it('does not escape HTML', () => {
    expect(sanitizeRaw('<script>')).toBe('<script>')
  })

  it('returns empty for non-string', () => {
    expect(sanitizeRaw(null)).toBe('')
  })
})

describe('sanitizeInt', () => {
  it('parses valid integer', () => {
    expect(sanitizeInt('42')).toBe(42)
  })

  it('returns null for invalid', () => {
    expect(sanitizeInt('abc')).toBeNull()
    expect(sanitizeInt('')).toBeNull()
    expect(sanitizeInt(null)).toBeNull()
  })
})

describe('sanitizePeerName', () => {
  it('keeps valid characters', () => {
    expect(sanitizePeerName('Alice Téléphone-2')).toBe('Alice Téléphone-2')
  })

  it('removes invalid characters', () => {
    expect(sanitizePeerName('hello<script>')).toBe('helloscript')
  })

  it('truncates long names', () => {
    const long = 'a'.repeat(300)
    expect(sanitizePeerName(long).length).toBe(255)
  })
})

describe('sanitizeInterfaceName', () => {
  it('accepts wg0-wg999', () => {
    expect(sanitizeInterfaceName('wg0')).toBe('wg0')
    expect(sanitizeInterfaceName('WG5')).toBe('wg5')
    expect(sanitizeInterfaceName('wg42')).toBe('wg42')
  })

  it('rejects invalid names', () => {
    expect(sanitizeInterfaceName('wg')).toBe('')
    expect(sanitizeInterfaceName('wgxx')).toBe('')
    expect(sanitizeInterfaceName('eth0')).toBe('')
    expect(sanitizeInterfaceName('')).toBe('')
  })
})

describe('sanitizeIp', () => {
  it('accepts valid IPv4', () => {
    expect(sanitizeIp('192.168.1.1')).toBe('192.168.1.1')
    expect(sanitizeIp('10.0.0.5')).toBe('10.0.0.5')
  })

  it('rejects invalid IPs', () => {
    expect(sanitizeIp('256.1.1.1')).toBe('')
    expect(sanitizeIp('abc')).toBe('')
    expect(sanitizeIp('')).toBe('')
  })

  it('rejects IPv6', () => {
    expect(sanitizeIp('::1')).toBe('')
  })
})

describe('sanitizeCidr', () => {
  it('accepts valid CIDR', () => {
    expect(sanitizeCidr('10.0.0.1/24')).toBe('10.0.0.1/24')
    expect(sanitizeCidr('192.168.1.0/16')).toBe('192.168.1.0/16')
  })

  it('rejects invalid CIDR', () => {
    expect(sanitizeCidr('10.0.0.1/33')).toBe('')
    expect(sanitizeCidr('10.0.0.1/-1')).toBe('')
    expect(sanitizeCidr('10.0.0.1')).toBe('')
    expect(sanitizeCidr('abc')).toBe('')
  })

  it('rejects out-of-range IP octets', () => {
    expect(sanitizeCidr('300.0.0.1/24')).toBe('')
  })
})

describe('sanitizePort', () => {
  it('accepts valid ports', () => {
    expect(sanitizePort('80')).toBe(80)
    expect(sanitizePort('51820')).toBe(51820)
    expect(sanitizePort('1')).toBe(1)
    expect(sanitizePort('65535')).toBe(65535)
  })

  it('rejects invalid ports', () => {
    expect(sanitizePort('0')).toBeNull()
    expect(sanitizePort('65536')).toBeNull()
    expect(sanitizePort('abc')).toBeNull()
    expect(sanitizePort('')).toBeNull()
  })
})

describe('sanitizeEndpoint', () => {
  it('accepts hostname', () => {
    expect(sanitizeEndpoint('vpn.example.com')).toBe('vpn.example.com')
  })

  it('accepts IP:port', () => {
    expect(sanitizeEndpoint('1.2.3.4:51820')).toBe('1.2.3.4:51820')
  })

  it('lowercases and strips', () => {
    expect(sanitizeEndpoint('  VPN.EXAMPLE.COM  ')).toBe('vpn.example.com')
  })

  it('strips dangerous chars', () => {
    expect(sanitizeEndpoint('hello<script>')).toBe('helloscript')
  })
})

describe('sanitizeEmail', () => {
  it('accepts valid email', () => {
    expect(sanitizeEmail('Test@Example.com')).toBe('test@example.com')
  })

  it('rejects invalid email', () => {
    expect(sanitizeEmail('not-an-email')).toBe('')
    expect(sanitizeEmail('')).toBe('')
  })

  it('does not munge plus-addressed emails', () => {
    expect(sanitizeEmail('user+tag@example.com')).toBe('user+tag@example.com')
  })

  it('does not strip dots from addresses', () => {
    expect(sanitizeEmail('user.name@example.com')).toBe('user.name@example.com')
  })
})

describe('sanitizeAllowedIps', () => {
  it('accepts valid CIDRs', () => {
    expect(sanitizeAllowedIps('0.0.0.0/0')).toBe('0.0.0.0/0')
    expect(sanitizeAllowedIps('10.0.0.0/24')).toBe('10.0.0.0/24')
  })

  it('accepts comma-separated ranges', () => {
    expect(sanitizeAllowedIps('10.0.0.0/24, 192.168.1.0/24')).toBe('10.0.0.0/24, 192.168.1.0/24')
  })

  it('rejects out-of-range IP octets', () => {
    expect(sanitizeAllowedIps('300.0.0.0/24')).toBe('')
  })

  it('rejects invalid mask bits', () => {
    expect(sanitizeAllowedIps('10.0.0.0/33')).toBe('')
    expect(sanitizeAllowedIps('10.0.0.0/-1')).toBe('')
  })

  it('rejects non-CIDR format', () => {
    expect(sanitizeAllowedIps('10.0.0.1')).toBe('')
    expect(sanitizeAllowedIps('abc')).toBe('')
    expect(sanitizeAllowedIps('')).toBe('')
  })

  it('rejects if any range in the list is invalid', () => {
    expect(sanitizeAllowedIps('10.0.0.0/24, 300.0.0.0/24')).toBe('')
  })

  it('normalizes spacing', () => {
    expect(sanitizeAllowedIps('10.0.0.0/24,192.168.1.0/24')).toBe('10.0.0.0/24, 192.168.1.0/24')
  })
})

describe('sanitizeDns', () => {
  it('accepts valid IPv4 DNS', () => {
    expect(sanitizeDns('1.1.1.1')).toBe('1.1.1.1')
    expect(sanitizeDns('8.8.8.8')).toBe('8.8.8.8')
  })

  it('rejects invalid DNS', () => {
    expect(sanitizeDns('abc')).toBe('')
    expect(sanitizeDns('')).toBe('')
    expect(sanitizeDns('not-an-ip')).toBe('')
  })
})
