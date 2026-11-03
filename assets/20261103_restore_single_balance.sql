-- Restore the original single-wallet-balance model.
-- Run this once in Supabase SQL Editor before deploying the code changes.
-- Existing funds from either split column are preserved.

alter table public.wallets add column if not exists balance numeric not null default 0;

update public.wallets
set balance = coalesce(deposit_balance, 0) + coalesce(withdrawal_balance, 0);

alter table public.wallets
  drop column if exists deposit_balance,
  drop column if exists withdrawal_balance;
