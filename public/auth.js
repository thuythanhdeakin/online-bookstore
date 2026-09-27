document.addEventListener('DOMContentLoaded', function() {
  fetch('/api/me').then(function(r) { return r.json(); }).then(function(data) {
    var navAuth = document.getElementById('navAuth');
    if (!navAuth) return;

    if (data.loggedIn) {
      navAuth.innerHTML =
        '<div class="d-flex align-items-center gap-2">' +
        '<span class="small text-muted">Hi, ' + data.user.full_name + '</span>' +
        '<a href="profile.html" class="btn btn-sm pt-btn-outline">Profile</a>' +
        '<button class="btn btn-sm pt-btn-outline" onclick="doLogout()">Logout</button>' +
        '</div>';
    } else {
      navAuth.innerHTML =
        '<div class="d-flex align-items-center gap-2">' +
        '<a href="login.html" class="btn btn-sm pt-btn-outline">Login</a>' +
        '<a href="register.html" class="btn btn-sm pt-btn">Register</a>' +
        '</div>';
    }
  });
});

function doLogout() {
  fetch('/api/logout', { method: 'POST' }).then(function() {
    window.location.href = 'index.html';
  });
}
