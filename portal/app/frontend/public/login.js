document.addEventListener('DOMContentLoaded', async () => {
  const btn = document.getElementById('btn');
  if (btn) btn.addEventListener('click', () => Auth.requireAuth().catch(console.error));
  try {
    await Auth.requireAuth();
  } catch (e) {
    console.error(e);
    const p = document.createElement('p');
    p.style.color = '#b00020';
    p.textContent = e.message || 'Falha ao iniciar autenticação';
    document.body.appendChild(p);
  }
});
