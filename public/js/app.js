function calcEntropy(pwd) {
  if (!pwd) return 0
  let pool = 0
  if (/[a-z]/.test(pwd)) pool += 26
  if (/[A-Z]/.test(pwd)) pool += 26
  if (/[0-9]/.test(pwd)) pool += 10
  if (/[^a-zA-Z0-9]/.test(pwd)) pool += 33
  if (pool === 0) return 0
  return Math.round(pwd.length * Math.log2(pool) * 10) / 10
}

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId)
  if (!input) return
  const isPassword = input.type === 'password'
  input.type = isPassword ? 'text' : 'password'
  btn.classList.toggle('active', isPassword)
  btn.innerHTML = isPassword
    ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7 7 0 0 0-2.79.588l.77.771A6 6 0 0 1 8 3.5c3.059 0 5.122 2.125 6.147 3.124q.238.232.38.376.14.143.207.212c.109.11.172.163.186.184l.003.003a.08.08 0 0 1 0 .008l-.006.005-.196.197-.1.1a2 2 0 0 1-.34.4c-.321.291-.777.694-1.328 1.122a7 7 0 0 1-.988.62z"/><path d="M11.436 9.702A2.5 2.5 0 0 0 9.5 6.747l.71.71A1.5 1.5 0 0 1 11.5 8q0 .12-.064.202z"/><path d="M6.5 8A1.5 1.5 0 0 1 8 6.5l.25-.25a2.5 2.5 0 0 0-1.12.068z"/><path d="M2.344 4.588A9 9 0 0 0 .642 6.46c-.502.602-.916 1.153-1.19 1.544q-.139.198-.207.275l-.005.006v.003a.04.04 0 0 0 0 .005l.003.004.048.057.002.003c.04.047.12.139.24.26.24.243.597.604 1.06 1.014C1.822 10.71 3.482 12.5 6.5 12.5c1.234 0 2.297-.33 3.163-.882l-.68-.68c-.534.229-1.232.314-1.983.22q-.148-.02-.304-.044l-.603-.604a3.4 3.4 0 0 0 .303-.302l1.348-1.348A2.5 2.5 0 0 1 6.023 8.06l-.001.001A2.5 2.5 0 0 1 6.5 8"/><path d="M.86 1.146a.5.5 0 1 0-.708.708L3.41 4.113A8.5 8.5 0 0 0 1.513 5.95a13 13 0 0 0-1.29 1.72l-.005.007-.001.001v.003a.5.5 0 0 0 .07.12q.04.043.056.066l.003.004c.036.045.106.133.208.26.206.26.513.632.917 1.019.564.54 1.31 1.106 2.215 1.588l-1.84 1.84a.5.5 0 0 0 .708.708z"/></svg>'
    : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8M1.173 8a13 13 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5s3.879 1.168 5.168 2.457A13 13 0 0 1 14.828 8q-.086.13-.195.288c-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5s-3.879-1.168-5.168-2.457A13 13 0 0 1 1.172 8z"/><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0"/></svg>'
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('form[data-validate]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      const inputs = form.querySelectorAll('input[required], select[required]')
      let valid = true
      inputs.forEach((input) => {
        if (!input.value.trim()) {
          valid = false
          input.classList.add('is-invalid')
        } else {
          input.classList.remove('is-invalid')
        }
      })
      if (!valid) e.preventDefault()
    })
  })

  let pendingForm = null
  const confirmModal = document.getElementById('confirmModal')
  const confirmModalBody = document.getElementById('confirmModalBody')
  const confirmModalBtn = document.getElementById('confirmModalBtn')
  const bsConfirmModal = confirmModal ? new bootstrap.Modal(confirmModal) : null

  document.querySelectorAll('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      pendingForm = form
      confirmModalBody.textContent = form.getAttribute('data-confirm')
      bsConfirmModal.show()
    })
  })

  if (confirmModalBtn) {
    confirmModalBtn.addEventListener('click', () => {
      if (pendingForm) {
        pendingForm.submit()
        pendingForm = null
      }
      bsConfirmModal.hide()
    })
  }

  if (confirmModal) {
    confirmModal.addEventListener('hidden.bs.modal', () => {
      pendingForm = null
    })
  }

  document.querySelectorAll('[data-toggle-password]').forEach((btn) => {
    btn.addEventListener('click', () => togglePassword(btn.getAttribute('data-toggle-password'), btn))
  })

  const newPwd = document.getElementById('new_password')
  const meter = document.getElementById('entropy-meter')
  const bar = document.getElementById('entropy-bar')
  const label = document.getElementById('entropy-label')
  const val = document.getElementById('entropy-value')
  if (newPwd && meter) {
    newPwd.addEventListener('input', () => {
      const entropy = calcEntropy(newPwd.value)
      if (newPwd.value.length === 0) { meter.style.display = 'none'; return }
      meter.style.display = 'block'
      const pct = Math.min(100, Math.round(entropy / 80 * 100))
      bar.style.width = pct + '%'
      val.textContent = entropy
      const strong = label.getAttribute('data-strong') || 'Strong'
      const medium = label.getAttribute('data-medium') || 'Medium'
      const weak = label.getAttribute('data-weak') || 'Weak'
      if (entropy >= 60) { bar.className = 'progress-bar bg-success'; label.textContent = strong }
      else if (entropy >= 40) { bar.className = 'progress-bar bg-warning'; label.textContent = medium }
      else { bar.className = 'progress-bar bg-danger'; label.textContent = weak }
    })
  }

  document.querySelectorAll('.toast').forEach((toast) => {
    new bootstrap.Toast(toast, { autohide: true, delay: 5000 })
  })

  const debugCheckbox = document.getElementById('debug_mode')
  const debugHidden = document.getElementById('debug_mode_hidden')
  const debugForm = document.getElementById('debug-form')
  if (debugCheckbox && debugHidden && debugForm) {
    debugCheckbox.addEventListener('change', function () {
      debugHidden.value = this.checked ? '1' : '0'
      debugForm.submit()
    })
  }

  document.querySelectorAll('select[data-auto-submit]').forEach((select) => {
    select.addEventListener('change', function () {
      this.form.submit()
    })
  })
})
