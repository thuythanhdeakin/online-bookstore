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

  items.replaceChildren();
  if (cart.length === 0) {
    items.appendChild(cartEl('p', 'text-muted small mb-0', 'Your cart is empty.'));
    if (total)    total.style.display    = 'none';
    if (checkout) checkout.style.display = 'none';
    return;
  }

  // Built with DOM APIs + textContent: titles/img URLs from localStorage are untrusted
  cart.forEach(function(item, idx) {
    var row = cartEl('div', 'pt-cart-item');
    var img = document.createElement('img');
    if (/^https:\/\//.test(item.img || '')) img.src = item.img;
    img.alt = item.title;
    row.appendChild(img);

    var info = cartEl('div', 'pt-cart-item-info');
    info.appendChild(cartEl('p', 'pt-cart-item-title', item.title));
    info.appendChild(cartEl('p', 'pt-cart-item-price', '$' + item.price.toFixed(2)));
    var qty = cartEl('div', 'pt-cart-qty');
    qty.appendChild(cartButton('\u2212', function() { updateQty(idx, -1); }));
    qty.appendChild(cartEl('span', '', String(item.qty)));
    qty.appendChild(cartButton('+', function() { updateQty(idx, 1); }));
    info.appendChild(qty);
    row.appendChild(info);

    var remove = cartButton('\u2715', function() { removeFromCart(idx); });
    remove.className = 'pt-cart-remove';
    remove.setAttribute('aria-label', 'Remove');
    row.appendChild(remove);
    items.appendChild(row);
  });

  var sum = cart.reduce(function(s, i) { return s + i.price * i.qty; }, 0);
  if (totalAmt) totalAmt.textContent = '$' + sum.toFixed(2);
  if (total)    total.style.display  = 'flex';
  if (checkout) checkout.style.display = 'block';
}

function cartEl(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function cartButton(label, onClick) {
  var b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', function(e) { e.stopPropagation(); onClick(); });
  return b;
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