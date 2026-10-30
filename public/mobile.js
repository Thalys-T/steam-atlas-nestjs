(() => {
  const button = document.getElementById('install-app');
  const dialog = document.getElementById('install-dialog');
  const note = document.getElementById('install-note');
  const offline = document.getElementById('offline-notice');
  const display = window.matchMedia('(display-mode: standalone)');
  let installPrompt = null;
  const updateMode = () => { button.hidden = display.matches || navigator.standalone === true; };
  const updateConnection = () => { offline.hidden = navigator.onLine; };
  display.addEventListener('change', updateMode);
  window.addEventListener('online', updateConnection);
  window.addEventListener('offline', updateConnection);
  updateMode(); updateConnection();
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installPrompt = event;
  });
  window.addEventListener('appinstalled', () => { installPrompt = null; button.hidden = true; dialog.close(); });
  button.addEventListener('click', async () => {
    if (installPrompt) {
      const prompt = installPrompt; installPrompt = null;
      try { await prompt.prompt(); await prompt.userChoice; return; } catch { /* Mostra instruções manuais se o navegador não abrir o convite. */ }
    }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    note.textContent = local ? 'Você está usando a versão local deste computador. Para instalar no celular, abra no aparelho o endereço HTTPS da versão publicada.' : !window.isSecureContext ? 'A instalação requer um endereço seguro (HTTPS). Neste endereço você pode usar a interface pelo navegador.' : 'A instalação depende do navegador. Se a opção não aparecer, abra este endereço no Chrome (Android) ou no Safari (iPhone).';
    dialog.showModal();
  });
  document.getElementById('close-install').addEventListener('click', () => dialog.close());
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {
        // O site continua utilizável caso o navegador não permita salvar a interface.
      });
    });
  }
})();
