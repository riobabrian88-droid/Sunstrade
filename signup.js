(function(){
  const form = document.getElementById('signupForm');
  const successPanel = document.getElementById('successPanel');
  const submitBtn = form.querySelector('button[type="submit"]');

  // --- password strength meter ---
  const pwMeter = document.getElementById('pwMeter');
  const pwBars = pwMeter.querySelectorAll('span');
  const pwHint = document.getElementById('pwHint');
  const levelColor = {1:'var(--up)',2:'var(--gold)',3:'var(--gold-bright)',4:'var(--down)'};
  const levelLabel = {1:'Weak',2:'Fair',3:'Good',4:'Strong'};

  function updateMeter(){
    const pw = document.getElementById('password').value;
    if(!pw || pw.length < 8){
      pwBars.forEach((b,i) => b.style.background = (pw && i === 0) ? levelColor[1] : '');
      pwHint.textContent = 'At least 8 characters.';
      return;
    }
    let extra = 0;
    if(/[a-z]/.test(pw) && /[A-Z]/.test(pw)) extra++;
    if(/\d/.test(pw)) extra++;
    if(/[^A-Za-z0-9]/.test(pw)) extra++;
    const score = extra + 1;
    pwBars.forEach((b,i) => b.style.background = i < score ? levelColor[score] : '');
    pwHint.textContent = levelLabel[score] + (score < 4 ? ' — mix in numbers, symbols, or capitals for stronger.' : ' password.');
  }
  document.getElementById('password').addEventListener('input', updateMeter);

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

    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const country = document.getElementById('country').value;
    const password = document.getElementById('password').value;
    const confirm = document.getElementById('confirm').value;
    const terms = document.getElementById('terms').checked;
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    let firstInvalid = null;
    const invalid = (id) => { firstInvalid = firstInvalid || id; };

    setError('name', name ? '' : 'Enter your full name.');
    if(!name) invalid('name');

    setError('email', !email ? 'Enter your email address.' : (emailOk ? '' : 'Enter a valid email address.'));
    if(!email || !emailOk) invalid('email');

    setError('country', country ? '' : 'Select your country of residence.');
    if(!country) invalid('country');

    setError('password', password.length >= 8 ? '' : 'Use at least 8 characters.');
    if(password.length < 8) invalid('password');

    setError('confirm', (confirm && confirm === password) ? '' : "Passwords don't match.");
    if(!confirm || confirm !== password) invalid('confirm');

    setError('terms', terms ? '' : 'You need to accept the terms to continue.');
    if(!terms) invalid('terms');

    if(firstInvalid){
      document.getElementById(firstInvalid).focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account…';

    const { error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          country: country,
          terms_accepted_at: new Date().toISOString()
        }
      }
    });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Create account';

    if(error){
      setError('email', error.message);
      document.getElementById('email').focus();
      return;
    }

    document.getElementById('successEmail').textContent = email;
    form.style.display = 'none';
    successPanel.classList.add('show');
  });

  document.getElementById('pwToggle').addEventListener('click', function(){
    const pw = document.getElementById('password');
    const showing = pw.type === 'text';
    pw.type = showing ? 'password' : 'text';
    this.textContent = showing ? 'Show' : 'Hide';
    this.setAttribute('aria-pressed', String(!showing));
  });
})();
