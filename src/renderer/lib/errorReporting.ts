/**
 * Envia erros não tratados do renderer para o log do main (sem stack trace na interface).
 */
export function installErrorReporting(page: string): void {
  window.addEventListener('error', (event) => {
    window.clipster.log.write('error', 'renderer.error', {
      page,
      message: event.message.slice(0, 500)
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason: unknown = event.reason;
    window.clipster.log.write('error', 'renderer.unhandled_rejection', {
      page,
      message: (reason instanceof Error ? reason.message : String(reason)).slice(0, 500)
    });
  });
}
