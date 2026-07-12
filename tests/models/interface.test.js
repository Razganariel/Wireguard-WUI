import { describe, it, expect } from 'vitest'
import interfaceModel from '../../models/interface.js'

let createdId

describe('interface model', () => {
  it('creates an interface', () => {
    const id = interfaceModel.create({
      nom: 'wg0',
      private_key: 'privkey123',
      public_key: 'pubkey123',
      adresse_ip: '10.0.0.1/24',
      port: 51820,
      endpoint: 'vpn.example.com'
    })
    expect(id).toBeGreaterThan(0)
    createdId = id
    expect(interfaceModel.count()).toBe(1)
  })

  it('finds by id', () => {
    const iface = interfaceModel.findById(createdId)
    expect(iface).toBeDefined()
    expect(iface.nom).toBe('wg0')
    expect(iface.port).toBe(51820)
    expect(iface.endpoint).toBe('vpn.example.com')
  })

  it('finds all interfaces', () => {
    interfaceModel.create({ nom: 'wg1', private_key: 'k2', public_key: 'k2', adresse_ip: '10.0.0.2/24' })
    const all = interfaceModel.findAll()
    expect(all.length).toBe(2)
  })

  it('finds first interface', () => {
    const first = interfaceModel.findFirst()
    expect(first).toBeDefined()
    expect(first.nom).toBe('wg0')
  })

  it('updates fields', () => {
    interfaceModel.update(createdId, { adresse_ip: '10.10.10.1/24', port: 51821, endpoint: 'new.example.com' })
    const updated = interfaceModel.findById(createdId)
    expect(updated.adresse_ip).toBe('10.10.10.1/24')
    expect(updated.port).toBe(51821)
    expect(updated.endpoint).toBe('new.example.com')
  })

  it('updates active status', () => {
    interfaceModel.updateActive(createdId, true)
    expect(interfaceModel.findById(createdId).active).toBe(1)
    interfaceModel.updateActive(createdId, false)
    expect(interfaceModel.findById(createdId).active).toBe(0)
  })

  it('removes an interface', () => {
    const iface = interfaceModel.findAll().find(i => i.nom === 'wg1')
    interfaceModel.remove(iface.id)
    expect(interfaceModel.findById(iface.id)).toBeUndefined()
    expect(interfaceModel.count()).toBe(1)
  })
})
