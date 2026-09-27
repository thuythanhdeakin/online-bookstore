'use strict';
const v = require('../../src/services/validation');

describe('validation', () => {
  test.each([
    ['a@b.co', true], ['USER@Example.com', true], ['no-at-sign', false], ['a@b', false], ['@b.com', false], ['', false],
  ])('isValidEmail(%p) = %p', (email, ok) => expect(v.isValidEmail(email)).toBe(ok));

  test.each([
    [undefined, true], ['', true], ['0412 345 678', true], ['12ab', false], ['1234567890123456', false], [42, false],
  ])('isValidPhone(%p) = %p', (phone, ok) => expect(v.isValidPhone(phone)).toBe(ok));

  test('normaliseEmail trims and lower-cases', () => {
    expect(v.normaliseEmail('  Thanh@Example.COM ')).toBe('thanh@example.com');
    expect(v.normaliseEmail(undefined)).toBe('');
  });

  test('registration rules', () => {
    const ok = { full_name: 'T', email: 't@x.com', password: 'secret1' };
    expect(v.validateRegistration(ok)).toBeNull();
    expect(v.validateRegistration({ ...ok, full_name: '' })).toMatch(/required/);
    expect(v.validateRegistration({ ...ok, email: 'bad' })).toMatch(/valid email/);
    expect(v.validateRegistration({ ...ok, password: '123' })).toMatch(/Password/);
    expect(v.validateRegistration({ ...ok, password: 'x'.repeat(73) })).toMatch(/Password/);
    expect(v.validateRegistration({ ...ok, phone: 'abc' })).toMatch(/Phone/);
  });

  test('query rules', () => {
    const ok = { full_name: 'T', email: 't@x.com', query_message: 'Hi' };
    expect(v.validateQuery(ok)).toBeNull();
    expect(v.validateQuery({ ...ok, query_message: '   ' })).toMatch(/required/);
    expect(v.validateQuery({ ...ok, email: 'x' })).toMatch(/valid email/);
    expect(v.validateQuery({ ...ok, phone: '12-34' })).toMatch(/Phone/);
  });

  test('delivery rules', () => {
    const ok = { full_name: 'T', email: 't@x.com', address: 'a', city: 'b', postcode: '3000', payment_method: 'PayPal' };
    expect(v.validateDelivery(ok)).toBeNull();
    expect(v.validateDelivery({ ...ok, city: '' })).toMatch(/required/);
    expect(v.validateDelivery({ ...ok, email: 'x' })).toMatch(/valid email/);
    expect(v.validateDelivery({ ...ok, postcode: '30000' })).toMatch(/Postcode/);
    expect(v.validateDelivery({ ...ok, payment_method: 'Bitcoin' })).toMatch(/payment/);
  });
});
