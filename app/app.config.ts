export default defineAppConfig({
  ui: {
    colors: {
      primary: 'primary',
      neutral: 'zinc'
    },
    button: {
      slots: {
        base: 'font-medium rounded-lg transition-colors'
      }
    },
    input: {
      slots: {
        base: 'rounded-lg'
      }
    },
    textarea: {
      slots: {
        base: 'rounded-lg'
      }
    },
    select: {
      slots: {
        base: 'rounded-lg'
      }
    }
  }
})
