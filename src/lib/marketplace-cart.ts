/**
 * Cart limits shared by the cart API (add) and cart checkout.
 *
 * Checkout settles every line in ONE interactive transaction (a listing lock,
 * a purchase row, offer/bid cleanup and a seller credit per line), and
 * Accelerate refuses a transaction past 15s — so the cart is bounded.
 * Every listing is a single digital asset, so quantity is always 1.
 */
export const CART_MAX_ITEMS = 20;
