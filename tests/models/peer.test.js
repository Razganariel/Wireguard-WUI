import { describe, it, expect } from 'vitest'
import interfaceModel from '../../models/interface.js'
import peerModel from '../../models/peer.js'

let ifaceId

describe('peer model', () => {
  it('creates an interface for the test', () => {
    ifaceId = interfaceModel.create({
      nom: 'wg_peer_test',
      private_key: 'pk',
      public_key: 'PK',
      adresse_ip: '10.0.0.1/24'
    })
    expect(ifaceId).toBeGreaterThan(0)
  })

  it('creates a peer', () => {
    const id = peerModel.create({
      interface_id: ifaceId,
      nom: 'phone-alice',
      adresse_ip: '10.0.0.2',
      public_key: 'peer-pubkey-abc',
      private_key: 'peer-privkey-abc',
      preshared_key: 'psk-123',
      allowed_ips: '0.0.0.0/0',
      dns: '1.1.1.1',
      persistent_keepalive: 25
    })
    expect(id).toBeGreaterThan(0)
  })

  it('finds peer by id', () => {
    const peers = peerModel.findByInterfaceId(ifaceId)
    expect(peers.length).toBe(1)
    const peer = peerModel.findById(peers[0].id)
    expect(peer.nom).toBe('phone-alice')
    expect(peer.preshared_key).toBe('psk-123')
    expect(peer.dns).toBe('1.1.1.1')
  })

  it('finds peers by interface id', () => {
    const peers = peerModel.findByInterfaceId(ifaceId)
    expect(peers.length).toBe(1)
    expect(peers[0].adresse_ip).toBe('10.0.0.2')
  })

  it('updates a peer', () => {
    const peers = peerModel.findByInterfaceId(ifaceId)
    peerModel.update(peers[0].id, { nom: 'phone-bob', allowed_ips: '10.0.0.0/24' })
    const updated = peerModel.findById(peers[0].id)
    expect(updated.nom).toBe('phone-bob')
    expect(updated.allowed_ips).toBe('10.0.0.0/24')
  })

  it('removes a peer', () => {
    const id = peerModel.create({
      interface_id: ifaceId,
      nom: 'temp-peer',
      adresse_ip: '10.0.0.3',
      public_key: 'temp-k',
      private_key: 'temp-k'
    })
    expect(peerModel.findByInterfaceId(ifaceId).length).toBe(2)
    peerModel.remove(id)
    expect(peerModel.findByInterfaceId(ifaceId).length).toBe(1)
  })

  it('returns empty array for unknown interface', () => {
    expect(peerModel.findByInterfaceId(-1)).toEqual([])
  })
})
