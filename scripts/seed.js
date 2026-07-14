// SPDX-License-Identifier: AGPL-3.0-only

const bcrypt = require('bcrypt')
const db = require('../db')
const userModel = require('../models/user')

async function seedAdmin() {
  const count = userModel.count()

  if (count > 0) {
    console.log('Seed: users already exist, skipping.')
    return
  }

  const hashedPassword = await bcrypt.hash('admin', 10)

  userModel.create({
    nom: 'Admin',
    prenom: 'Admin',
    email: 'admin@wireguard.local',
    password: hashedPassword
  })

  console.log('Seed: default admin created (admin@wireguard.local / admin)')
}

seedAdmin().catch((err) => {
  console.error('Seed error:', err)
  process.exit(1)
})
