const express = require('express');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');
const { getDb, run, get, all } = require('./database');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'bookstore-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

getDb().then(() => console.log('Database ready'));

// ─── REGISTER ────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { full_name, email, password, phone } = req.body;
  if (!full_name || !email || !password)
    return res.status(400).json({ error: 'Full name, email and password are required.' });
  if (!email.includes('@'))
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (phone) {
    const digits = phone.replace(/\s/g, '');
    if (!/^\d+$/.test(digits) || digits.length > 15)
      return res.status(400).json({ error: 'Phone must contain digits only, max 15 characters.' });
  }
  await getDb();
  const existing = get('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) return res.status(400).json({ error: 'An account with this email already exists.' });
  const hashedPassword = bcrypt.hashSync(password, 10);
  run('INSERT INTO users (full_name, email, password, phone) VALUES (?, ?, ?, ?)',
    [full_name, email, hashedPassword, phone || null]);
  const user = get('SELECT id, full_name, email FROM users WHERE email = ?', [email]);
  req.session.userId = user.id;
  req.session.userName = user.full_name;
  res.json({ success: true, user });
});

// ─── LOGIN ───────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required.' });
  await getDb();
  const user = get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) return res.status(400).json({ error: 'No account found with this email.' });
  if (!bcrypt.compareSync(password, user.password))
    return res.status(400).json({ error: 'Incorrect password.' });
  req.session.userId = user.id;
  req.session.userName = user.full_name;
  res.json({ success: true, user: { id: user.id, full_name: user.full_name, email: user.email } });
});

// ─── LOGOUT ──────────────────────────────────────────────────
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// ─── SESSION CHECK ───────────────────────────────────────────
app.get('/api/me', (req, res) => {
  if (req.session.userId) {
    const user = get('SELECT id, full_name, email, phone, points, created_at FROM users WHERE id = ?', [req.session.userId]);
    res.json({ loggedIn: true, user });
  } else {
    res.json({ loggedIn: false });
  }
});

// ─── SUBMIT QUERY ────────────────────────────────────────────
app.post('/api/queries', async (req, res) => {
  const { full_name, email, phone, query_message } = req.body;
  if (!full_name || !email || !query_message)
    return res.status(400).json({ error: 'Full name, email and query are required.' });
  if (!email.includes('@'))
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (phone) {
    const digits = phone.replace(/\s/g, '');
    if (!/^\d+$/.test(digits) || digits.length > 15)
      return res.status(400).json({ error: 'Phone must contain digits only, max 15 characters.' });
  }
  await getDb();
  run('INSERT INTO queries (full_name, email, phone, query_message) VALUES (?, ?, ?, ?)',
    [full_name, email, phone || null, query_message]);
  res.json({ success: true });
});

// ─── PLACE ORDER ─────────────────────────────────────────────
app.post('/api/orders', async (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: 'Please log in to place an order.' });

  const { full_name, email, address, city, postcode, payment_method, items, total } = req.body;
  if (!full_name || !email || !address || !city || !postcode || !payment_method)
    return res.status(400).json({ error: 'All delivery fields are required.' });
  if (!items || items.length === 0)
    return res.status(400).json({ error: 'Your cart is empty.' });

  await getDb();

  // Insert order
  run(`INSERT INTO orders (user_id, total, full_name, email, address, city, postcode, payment_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.session.userId, total, full_name, email, address, city, postcode, payment_method]);

  // Get the order id
  const order = get('SELECT id FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [req.session.userId]);

  // Insert order items
  items.forEach(item => {
    run('INSERT INTO order_items (order_id, title, author, price, qty, img) VALUES (?, ?, ?, ?, ?, ?)',
      [order.id, item.title, item.author || '', item.price, item.qty, item.img || '']);
  });

  // Add points: $1 = 1 point
  const pointsEarned = Math.floor(total);
  run('UPDATE users SET points = points + ? WHERE id = ?', [pointsEarned, req.session.userId]);

  res.json({ success: true, orderId: order.id, pointsEarned });
});

// ─── GET USER ORDERS ─────────────────────────────────────────
app.get('/api/orders', async (req, res) => {
  if (!req.session.userId)
    return res.status(401).json({ error: 'Please log in.' });
  await getDb();
  const orders = all('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [req.session.userId]);
  const result = orders.map(order => {
    const items = all('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
    return { ...order, items };
  });
  res.json(result);
});

// ─── ADMIN: ALL USERS ────────────────────────────────────────
app.get('/api/users', async (req, res) => {
  await getDb();
  const users = all('SELECT id, full_name, email, phone, points, created_at FROM users ORDER BY created_at DESC');
  res.json(users);
});

// ─── ADMIN: ALL QUERIES ──────────────────────────────────────
app.get('/api/queries', async (req, res) => {
  await getDb();
  const queries = all('SELECT * FROM queries ORDER BY created_at DESC');
  res.json(queries);
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));