/* Navbar login state. Built with DOM APIs + textContent (never innerHTML with
 * user data) - a full_name like <img src=x onerror=alert(1)> is shown as text. */
function el(tag, attrs, text) {
  var node = document.createElement(tag);
  Object.keys(attrs || {}).forEach(function(k) { node.setAttribute(k, attrs[k]); });
  if (text) node.textContent = text;
  return node;
}

document.addEventListener('DOMContentLoaded', function() {
  fetch('/api/me').then(function(r) { return r.json(); }).then(function(data) {
    var navAuth = document.getElementById('navAuth');
    if (!navAuth) return;
    var wrap = el('div', { class: 'd-flex align-items-center gap-2' });

    if (data.loggedIn) {
      wrap.appendChild(el('span', { class: 'small text-muted' }, 'Hi, ' + data.user.full_name));
      if (data.user.isAdmin) wrap.appendChild(el('a', { href: 'useradmin.html', class: 'btn btn-sm pt-btn-outline' }, 'Admin'));
      wrap.appendChild(el('a', { href: 'profile.html', class: 'btn btn-sm pt-btn-outline' }, 'Profile'));
      var logout = el('button', { class: 'btn btn-sm pt-btn-outline', type: 'button' }, 'Logout');
      logout.addEventListener('click', doLogout);
      wrap.appendChild(logout);
    } else {
      wrap.appendChild(el('a', { href: 'login.html', class: 'btn btn-sm pt-btn-outline' }, 'Login'));
      wrap.appendChild(el('a', { href: 'register.html', class: 'btn btn-sm pt-btn' }, 'Register'));
    }
    navAuth.replaceChildren(wrap);
  });
});

function doLogout() {
  fetch('/api/logout', { method: 'POST' }).then(function() {
    window.location.href = 'index.html';
  });
}
