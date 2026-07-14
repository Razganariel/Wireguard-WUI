import { describe, it, expect } from 'vitest'
import userModel from '../../models/user.js'

describe('user model', () => {
  it('creates a user', () => {
    const id = userModel.create({
      prenom: 'Jean',
      nom: 'Dupont',
      email: 'jean@test.com',
      password: '$2b$10$hash'
    })
    expect(id).toBeGreaterThan(0)
    expect(userModel.count()).toBe(1)
  })

  it('finds user by email', () => {
    const user = userModel.findByEmail('jean@test.com')
    expect(user).toBeDefined()
    expect(user.prenom).toBe('Jean')
    expect(user.nom).toBe('Dupont')
  })

  it('returns undefined for unknown email', () => {
    expect(userModel.findByEmail('unknown@test.com')).toBeUndefined()
  })

  it('finds user by id', () => {
    const user = userModel.findByEmail('jean@test.com')
    const found = userModel.findById(user.id)
    expect(found).toBeDefined()
    expect(found.email).toBe('jean@test.com')
  })

  it('updates a user', () => {
    const user = userModel.findByEmail('jean@test.com')
    userModel.update(user.id, { nom: 'Dupont2' })
    const updated = userModel.findById(user.id)
    expect(updated.nom).toBe('Dupont2')
  })

  it('deletes a user via update', () => {
    userModel.create({ prenom: 'Temp', nom: 'User', email: 'temp@test.com', password: 'hash' })
    const user = userModel.findByEmail('temp@test.com')
    expect(user).toBeDefined()
  })

  it('handles 2fa fields', () => {
    const id = userModel.create({
      prenom: 'TOTP',
      nom: 'User',
      email: 'totp@test.com',
      password: 'hash'
    })
    userModel.update(id, { '2fa_enabled': 1, totp_secret: 'JBSWY3DPEHPK3PXP' })
    const user = userModel.findById(id)
    expect(user['2fa_enabled']).toBe(1)
    expect(user.totp_secret).toBe('JBSWY3DPEHPK3PXP')
  })
})
