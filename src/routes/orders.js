'use strict';
const express = require('express');
const { validateDelivery } = require('../services/validation');
const { priceCart, pointsFor, PricingError } = require('../services/pricing');
const { requireLogin } = require('../middleware/auth');

module.exports = function orderRoutes({ db, metrics }) {
  const router = express.Router();
  router.use(requireLogin);

  // Place an order: re-priced on the server and written in ONE transaction
  router.post('/', (req, res) => {
    const body = req.body || {};
    const error = validateDelivery(body);
    if (error) return res.status(400).json({ error });

    let priced;
    try {
      priced = priceCart(body.items);
    } catch (err) {
      if (err instanceof PricingError) return res.status(400).json({ error: err.message });
      throw err;
    }
    const userId = req.session.userId;
    const pointsEarned = pointsFor(priced.total);

    const orderId = db.transaction(() => {
      db.run(
        `INSERT INTO orders (user_id, total, full_name, email, address, city, postcode, payment_method)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, priced.total, body.full_name.trim(), body.email.trim(), body.address.trim(),
          body.city.trim(), String(body.postcode).trim(), body.payment_method],
      );
      const id = db.lastInsertId(); // was: "latest order by created_at" -> wrong under concurrency
      for (const line of priced.lines) {
        db.run('INSERT INTO order_items (order_id, title, author, price, qty, img) VALUES (?, ?, ?, ?, ?, ?)',
          [id, line.title, line.author, line.price, line.qty, line.img]);
      }
      db.run('UPDATE users SET points = points + ? WHERE id = ?', [pointsEarned, userId]);
      return id;
    });

    metrics.ordersPlaced.inc();
    metrics.revenue.inc(priced.total);
    return res.status(201).json({ success: true, orderId, total: priced.total, pointsEarned });
  });

  // Order history for the logged-in user only
  router.get('/', (req, res) => {
    const orders = db.all('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC', [req.session.userId]);
    const result = orders.map((order) => ({
      ...order,
      items: db.all('SELECT title, author, price, qty, img FROM order_items WHERE order_id = ?', [order.id]),
    }));
    res.json(result);
  });

  return router;
};
