export default defineAppConfig({
  ui: {
    colors: {
      primary: 'green',
      secondary: 'zinc',
      neutral: 'zinc'
    },
    // Sheets use the drawer curve, and leave faster than they arrive.
    slideover: {
      compoundVariants: [{
        transition: true,
        side: 'left',
        class: { content: 'data-[state=open]:animate-[slide-in-from-left_240ms_var(--ease-drawer)] data-[state=closed]:animate-[slide-out-to-left_200ms_var(--ease-drawer)]' }
      }]
    }
  }
});
