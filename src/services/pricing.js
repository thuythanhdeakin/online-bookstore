'use strict';
/** Pure pricing / loyalty rules - no I/O, so they are easy to unit test. */
const { findBook } = require('./catalog');

const MAX_QTY_PER_ITEM = 20;

class PricingError extends Error {}

/** Round to cents without floating point drift (0.1 + 0.2 problem). */
function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Re-price the cart using the server catalogue.
 * Client-supplied prices and totals are IGNORED.
 */
function priceCart(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new PricingError('Your cart is empty.');
  }
  const lines = items.map((item) => {
    const book = findBook(item && item.title);
    if (!book) throw new PricingError(`Unknown book: ${String(item && item.title).slice(0, 80)}`);
    const qty = Number(item.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_ITEM) {
      throw new PricingError(`Invalid quantity for "${book.title}".`);
    }
    return {
      title: book.title,
      author: book.author,
      price: book.price,
      qty,
      img: typeof item.img === 'string' && /^https:\/\//.test(item.img) ? item.img.slice(0, 500) : '',
      lineTotal: roundMoney(book.price * qty),
    };
  });
  const total = roundMoney(lines.reduce((sum, l) => sum + l.lineTotal, 0));
  return { lines, total };
}

/** 1 loyalty point per whole dollar spent. */
function pointsFor(total) {
  return Math.max(0, Math.floor(total));
}

module.exports = { priceCart, pointsFor, roundMoney, PricingError, MAX_QTY_PER_ITEM };
