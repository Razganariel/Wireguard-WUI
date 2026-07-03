document.addEventListener('DOMContentLoaded', () => {
  const forms = document.querySelectorAll('form[data-validate]')
  forms.forEach((form) => {
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
      if (!valid) {
        e.preventDefault()
      }
    })
  })

  document.querySelectorAll('.toast.show').forEach((toast) => {
    setTimeout(() => {
      const bsToast = bootstrap.Toast.getInstance(toast)
      if (bsToast) {
        bsToast.hide()
      } else {
        toast.classList.remove('show')
      }
    }, 5000)
  })
})
