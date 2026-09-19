-- Bitget as a payment method.
--
-- Additive only: a new value on an existing enum. Nothing reads or writes it
-- until a subscription is bought with it, so this is safe to apply ahead of
-- the code that uses it.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'BITGET';
