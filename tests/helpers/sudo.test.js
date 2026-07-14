// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import sudo from '../../helpers/sudo.js'

describe('sudo.isCommandSafe', () => {
  it('allows wg-quick with up', () => {
    expect(sudo.isCommandSafe('wg-quick up wg0')).toBe(true)
  })

  it('allows wg show', () => {
    expect(sudo.isCommandSafe('wg show wg0 dump')).toBe(true)
  })

  it('allows wg syncconf', () => {
    expect(sudo.isCommandSafe('wg syncconf wg0 /tmp/foo.conf')).toBe(true)
  })

  it('allows wg pubkey with trailing content', () => {
    expect(sudo.isCommandSafe('wg pubkey < /tmp/key')).toBe(true)
  })

  it('allows iptables commands', () => {
    expect(sudo.isCommandSafe('iptables -t nat -A POSTROUTING -s 10.0.0.0/24 -o eth0 -j MASQUERADE')).toBe(true)
  })

  it('allows firewall-cmd commands', () => {
    expect(sudo.isCommandSafe('firewall-cmd --add-rich-rule=\'rule family="ipv4" source address="10.0.0.0/24" masquerade\'')).toBe(true)
  })

  it('allows cp with proper prefix', () => {
    expect(sudo.isCommandSafe('cp /tmp/foo /etc/wireguard/wg0.conf')).toBe(true)
  })

  it('allows chmod', () => {
    expect(sudo.isCommandSafe('chmod 600 /etc/wireguard/wg0.conf')).toBe(true)
  })

  it('allows rm', () => {
    expect(sudo.isCommandSafe('rm -f /etc/wireguard/wg0.conf')).toBe(true)
  })

  it('allows cat', () => {
    expect(sudo.isCommandSafe('cat /etc/wireguard/wg0.conf')).toBe(true)
  })

  it('allows find with exit 0', () => {
    expect(sudo.isCommandSafe('find /etc/wireguard -maxdepth 1 -name "*.conf" -exec basename {} .conf \\; 2>/dev/null; exit 0')).toBe(true)
  })

  it('rejects arbitrary commands', () => {
    expect(sudo.isCommandSafe('ls')).toBe(false)
    expect(sudo.isCommandSafe('echo hello')).toBe(false)
    expect(sudo.isCommandSafe('sudo rm -rf /')).toBe(false)
  })

  it('rejects commands with shell metacharacters', () => {
    expect(sudo.isCommandSafe('wg-quick up wg0; rm -rf /')).toBe(false)
    expect(sudo.isCommandSafe('wg show $(whoami)')).toBe(false)
    expect(sudo.isCommandSafe('wg show `whoami`')).toBe(false)
    expect(sudo.isCommandSafe('wg show | whoami')).toBe(false)
  })

  it('rejects more than one semicolon', () => {
    expect(sudo.isCommandSafe('echo a; echo b; echo c')).toBe(false)
  })

  it('allows single semicolon with exit 0', () => {
    expect(sudo.isCommandSafe('find /etc/wireguard -name "*.conf"; exit 0')).toBe(true)
  })

  it('rejects single semicolon without exit 0', () => {
    expect(sudo.isCommandSafe('wg-quick up wg0; rm -rf /')).toBe(false)
  })

  it('prevents prefix bypass on wg pubkey', () => {
    expect(sudo.isCommandSafe('wg pubkey_hack')).toBe(false)
  })

  it('prevents prefix bypass on firewall-cmd', () => {
    expect(sudo.isCommandSafe('firewall-cmd_malicious')).toBe(false)
  })
})

describe('sudo.setPassword / clearPassword / hasPassword', () => {
  beforeEach(() => {
    sudo.clearPassword()
  })

  it('starts with no password', () => {
    expect(sudo.hasPassword()).toBe(false)
  })

  it('sets and detects password', () => {
    sudo.setPassword('test-password')
    expect(sudo.hasPassword()).toBe(true)
  })

  it('clears password', () => {
    sudo.setPassword('test-password')
    sudo.clearPassword()
    expect(sudo.hasPassword()).toBe(false)
  })
})
