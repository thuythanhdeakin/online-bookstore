'use strict';
const { priceCart, pointsFor, roundMoney, PricingError } = require('../../src/services/pricing');

describe('pricing service', () => {
  test('prices a cart from the SERVER catalogue, ignoring client prices', () => {
    const { lines, total } = priceCart([
      { title: 'The Great Gatsby', price: 0, qty: 2 }, // client says $0 -> ignored
      { title: "Charlotte's Web", price: 999, qty: 1 },
    ]);
    expect(lines[0].price).toBe(18.99);
    expect(total).toBe(47.97);
  });

  test('title lookup is case/space insensitive', () => {
    expect(priceCart([{ title: '  the great gatsby ', qty: 1 }]).total).toBe(18.99);
  });

  test('regression: the old "$$18.99" price string no longer produces $0.00', () => {
    // Front-end used to send price NaN -> 0. Server now re-prices by title.
    expect(priceCart([{ title: 'The Great Gatsby', price: NaN, qty: 1 }]).total).toBe(18.99);
  });

  test.each([
    [[], 'Your cart is empty.'],
    [null, 'Your cart is empty.'],
    [[{ title: 'Not a real book', qty: 1 }], 'Unknown book'],
    [[{ title: 'The Great Gatsby', qty: 0 }], 'Invalid quantity'],
    [[{ title: 'The Great Gatsby', qty: 1.5 }], 'Invalid quantity'],
    [[{ title: 'The Great Gatsby', qty: 21 }], 'Invalid quantity'],
  ])('rejects invalid cart %j', (items, message) => {
    expect(() => priceCart(items)).toThrow(PricingError);
    expect(() => priceCart(items)).toThrow(message);
  });

  test('only https image URLs are kept', () => {
    const { lines } = priceCart([
      { title: 'The Great Gatsby', qty: 1, img: 'javascript:alert(1)' },
      { title: "Charlotte's Web", qty: 1, img: 'https://covers.openlibrary.org/x.jpg' },
    ]);
    expect(lines[0].img).toBe('');
    expect(lines[1].img).toMatch(/^https:/);
  });

  test('money rounding avoids floating point drift', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  test.each([[47.97, 47], [0.99, 0], [100, 100], [-5, 0]])('pointsFor(%p) = %p', (total, points) => {
    expect(pointsFor(total)).toBe(points);
  });
});
