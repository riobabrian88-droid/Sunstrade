(function(){
  async function init(){
    const { data: { session } } = await sb.auth.getSession();
    if(!session){
      window.location.href = 'login.html';
      return;
    }
    document.getElementById('userEmail').textContent = session.user.email;
  }

  document.getElementById('signOut').addEventListener('click', async function(){
    await sb.auth.signOut();
    window.location.href = 'login.html';
  });

  init();
})();
