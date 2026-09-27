'use strict';
/**
 * Server-side book catalogue - the single source of truth for PRICES.
 *
 * The original checkout trusted the price and total sent by the browser
 * (localStorage cart). That caused the "$0.00" bug and would also let
 * anyone buy a book for $0.01 by editing the request.
 */
const BOOKS = [
  { title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', genre: 'fiction', price: 18.99 },
  { title: 'The Catcher in the Rye', author: 'J.D. Salinger', genre: 'fiction', price: 16.99 },
  { title: 'To Kill a Mockingbird', author: 'Harper Lee', genre: 'fiction', price: 19.99 },
  { title: "The Handmaid's Tale", author: 'Margaret Atwood', genre: 'fiction', price: 22.99 },
  { title: 'The Old Man and the Sea', author: 'Ernest Hemingway', genre: 'fiction', price: 15.99 },
  { title: 'Of Mice and Men', author: 'John Steinbeck', genre: 'fiction', price: 14.99 },
  { title: 'A Brief History of Time', author: 'Stephen Hawking', genre: 'nonfiction', price: 29.99 },
  { title: 'Leonardo da Vinci', author: 'Walter Isaacson', genre: 'biography', price: 31.99 },
  { title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', genre: 'nonfiction', price: 27.99 },
  { title: "Harry Potter and the Sorcerer's Stone", author: 'J.K. Rowling', genre: 'childrens', price: 14.99 },
  { title: "Charlotte's Web", author: 'E.B. White', genre: 'childrens', price: 9.99 },
  { title: 'The Fault in Our Stars', author: 'John Green', genre: 'romance', price: 16.99 },
];

const byTitle = new Map(BOOKS.map((b) => [b.title.toLowerCase(), b]));

function findBook(title) {
  if (typeof title !== 'string') return null;
  return byTitle.get(title.trim().toLowerCase()) || null;
}

function listBooks() {
  return BOOKS.map((b) => ({ ...b }));
}

module.exports = { findBook, listBooks };
