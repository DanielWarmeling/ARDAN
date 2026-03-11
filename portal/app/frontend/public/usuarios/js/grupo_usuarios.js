document.addEventListener('DOMContentLoaded', async () => {
  await Auth.requireAuth();
  const ok = await Auth.guardModuleAccess('usuarios_admin', '/home.html');
  if (!ok) return;
  alert('Gestão de grupos local foi descontinuada. O vínculo de grupos/empresas deve ser feito no Keycloak.');
  window.location.href = '/usuarios/usuarios.html';
});
