var cart = (function() {
  try {
    var data = JSON.parse(localStorage.getItem('pt_cart') || '[]');
    // Validate: must be array with valid items
    if (!Array.isArray(data)) throw new Error('invalid');
    data = data.filter(function(i) {
      return i && typeof i.title === 'string' && i.qty > 0;
    });
    // Fix null/missing prices
    data.forEach(function(i) {
      i.price = parseFloat(i.price) || 0;
      i.qty = parseInt(i.qty) || 1;
    });
    return data;
  } catch (e) {
    localStorage.removeItem('pt_cart');
    return [];
  }
})();

function saveCart() {
  localStorage.setItem('pt_cart', JSON.stringify(cart));
}

function addToCart(title, author, price, img) {
  var existing = cart.find(function(i) { return i.title === title; });
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ title: title, author: author, price: price, img: img, qty: 1 });
  }
  saveCart();
  renderCart();
  var dd = document.getElementById('cartDropdown');
  if (dd) {
    dd.classList.add('open');
    setTimeout(function() { dd.classList.remove('open'); }, 2000);
  }
}

function removeFromCart(index) {
  cart.splice(index, 1);
  saveCart();
  renderCart();
}

function updateQty(index, delta) {
  cart[index].qty += delta;
  if (cart[index].qty <= 0) cart.splice(index, 1);
  saveCart();
  renderCart();
}

function renderCart() {
  var badge    = document.getElementById('cartBadge');
  var items    = document.getElementById('cartItems');
  var total    = document.getElementById('cartTotal');
  var totalAmt = document.getElementById('cartTotalAmount');
  var checkout = document.getElementById('checkoutBtn');

  if (!badge) return;

  var totalQty = cart.reduce(function(s, i) { return s + i.qty; }, 0);

  badge.textContent = totalQty;
  if (totalQty > 0) {
    badge.classList.add('visible');
  } else {
    badge.classList.remove('visible');
  }

  if (cart.length === 0) {
    items.innerHTML = '<p class="text-muted small mb-0">Your cart is empty.</p>';
    if (total)    total.style.display    = 'none';
    if (checkout) checkout.style.display = 'none';
    return;
  }

  var html = '';
  cart.forEach(function(item, idx) {
    html += '<div class="pt-cart-item">'
      + '<img src="' + item.img + '" alt="' + item.title + '" />'
      + '<div class="pt-cart-item-info">'
      + '<p class="pt-cart-item-title">' + item.title + '</p>'
      + '<p class="pt-cart-item-price">$' + item.price.toFixed(2) + '</p>'
      + '<div class="pt-cart-qty">'
      + '<button onclick="updateQty(' + idx + ', -1)">&#8722;</button>'
      + '<span>' + item.qty + '</span>'
      + '<button onclick="updateQty(' + idx + ', 1)">&#43;</button>'
      + '</div>'
      + '</div>'
      + '<button class="pt-cart-remove" onclick="removeFromCart(' + idx + ')" aria-label="Remove">&#10005;</button>'
      + '</div>';
  });
  items.innerHTML = html;

  var sum = cart.reduce(function(s, i) { return s + i.price * i.qty; }, 0);
  if (totalAmt) totalAmt.textContent = '$' + sum.toFixed(2);
  if (total)    total.style.display  = 'flex';
  if (checkout) checkout.style.display = 'block';
}

function toggleCart(e) {
  e.stopPropagation();
  document.getElementById('cartDropdown').classList.toggle('open');
}

document.addEventListener('click', function(e) {
  var dd = document.getElementById('cartDropdown');
  if (dd && !dd.contains(e.target)) {
    dd.classList.remove('open');
  }
});

document.addEventListener('DOMContentLoaded', renderCart);