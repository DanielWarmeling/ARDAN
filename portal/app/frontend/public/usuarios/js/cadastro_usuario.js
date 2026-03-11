document.addEventListener('DOMContentLoaded', async () => {
  await Auth.requireAuth();
  const ok = await Auth.guardModuleAccess('usuarios_admin', '/home.html');
  if (!ok) return;
  alert('Cadastro de usuário local foi descontinuado. Use a tela "Usuários" para liberar módulos por usuário Keycloak.');
  window.location.href = '/usuarios/usuarios.html';
});
