(function(){
  const form = document.getElementById('loginForm');
  const submitBtn = form.querySelector('button[type="submit"]');

  function setError(field, message){
    const errorEl = document.getElementById(field + '-error');
    const inputEl = document.getElementById(field);
    if(errorEl) errorEl.textContent = message || '';
    if(inputEl) inputEl.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  form.addEventListener('input', function(e){
    if(e.target.id && document.getElementById(e.target.id + '-error')){
      setError(e.target.id, '');
    }
  });

  form.addEventListener('submit', async function(e){
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    let firstInvalid = null;
    const invalid = (id) => { firstInvalid = firstInvalid || id; };

    setError('email', email ? '' : 'Enter your email address.');
    if(!email) invalid('email');

    setError('password', password ? '' : 'Enter your password.');
    if(!password) invalid('password');

    if(firstInvalid){
      document.getElementById(firstInvalid).focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';

    const { error } = await sb.auth.signInWithPassword({ email, password });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign in';

    if(error){
      setError('password', error.message);
      return;
    }

    window.location.href = 'dashboard.html';
  });

  document.getElementById('pwToggle').addEventListener('click', function(){
    const pw = document.getElementById('password');
    const showing = pw.type === 'text';
    pw.type = showing ? 'password' : 'text';
    this.textContent = showing ? 'Show' : 'Hide';
    this.setAttribute('aria-pressed', String(!showing));
  });
})();
