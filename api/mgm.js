import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin, jsonResponse } from './_utils.js';
import { getAdminUser } from './_auth.js';

const TERMINAL_SUCCESS = 100;
const TERMINAL_FAILURES = new Set([4, 5]);

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} environment variable`);
  return value;
}

export function mgmSignature(fields, secret) {
  const pairs = Object.entries(fields)
    .filter(([name, value]) => name !== 'signature' && value !== null && value !== '' && !['object', 'function'].includes(typeof value))
    .sort(([a], [b]) => Buffer.from(a).compare(Buffer.from(b)))
    .map(([name, value]) => `${name}=${value}`);
  return crypto.createHash('md5').update(`${pairs.join('&')}&key=${secret}`, 'utf8').digest('hex').toUpperCase();
}

function sameSignature(expected, received) {
  if (typeof received !== 'string' || !/^[A-F0-9]{32}$/i.test(received)) return false;
  const a = Buffer.from(expected.toUpperCase());
  const b = Buffer.from(received.toUpperCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function amount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Invalid amount');
  return parsed.toFixed(2);
}

function nonce() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function relayRequest(path, payload, timestamp) {
  const response = await fetch(required('MGM_RELAY_URL'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${required('MGM_RELAY_SECRET')}`,
      'ApiVersion': '1.0',
      'AppId': required('MGM_APP_ID'),
      'Noncestr': nonce(),
      'Timestamp': String(timestamp),
      'X-MGM-Path': path
    },
    body: JSON.stringify(payload)
  });
  let body;
  try { body = await response.json(); } catch { body = { state: 'error', message: 'Relay returned a non-JSON response' }; }
  if (!response.ok) throw new Error(body?.message || body?.error || `Relay returned HTTP ${response.status}`);
  return body;
}

export async function createMgmPayout({ orderId, payoutAmount, accountName, accountNumber, bankCode }) {
  const timestamp = Date.now();
  const data = {
    country: 'NG', currency: 'NGN', order_id: orderId, amount: amount(payoutAmount),
    notification_url: required('MGM_WITHDRAWAL_CALLBACK_URL'), timestamp,
    payee: { name: String(accountName), account: String(accountNumber), account_type: 'BANK', bank_code: String(bankCode) }
  };
  data.signature = mgmSignature({ country: data.country, currency: data.currency, order_id: data.order_id, amount: data.amount, notification_url: data.notification_url, timestamp }, required('MGM_PAYOUT_KEY'));
  return relayRequest('/api/settle/settlement', { merchant_no: required('MGM_MERCHANT_NO'), data }, timestamp);
}

async function queryGatewayBalance() {
  const merchantNo = required('MGM_MERCHANT_NO');
  const payload = { merchant_no: merchantNo, signature: mgmSignature({ merchant_no: merchantNo }, required('MGM_PAYOUT_KEY')) };
  const response = await relayRequest('/api/merchant/balance', payload, Date.now());
  if (response?.state !== 'ok' || !response.data) throw new Error(response?.message || response?.error || JSON.stringify(response));
  return response.data;
}

async function createMgmDeposit({ orderId, depositAmount, userId, transactionType = 'deposit' }) {
  const timestamp = Date.now();
  const data = {
    country: 'NG', currency: 'NGN', payment_method_id: 'BANK_CARD', payment_method_flow: 'REDIRECT',
    order_id: orderId, amount: amount(depositAmount), notification_url: required('MGM_DEPOSIT_CALLBACK_URL'), timestamp
  };
  if (process.env.MGM_DEPOSIT_SUCCESS_REDIRECT_URL) data.success_redirect_url = process.env.MGM_DEPOSIT_SUCCESS_REDIRECT_URL;
  data.signature = mgmSignature(data, required('MGM_COLLECTION_KEY'));

  const response = await relayRequest('/api/pay/payment', { merchant_no: required('MGM_MERCHANT_NO'), data }, timestamp);
  if (response?.state !== 'ok' || !response.data) {
    const detail = response?.message || response?.error || JSON.stringify(response);
    throw new Error(`MGM Pay rejected the deposit order: ${detail}`);
  }
  const result = response.data;
  const { error } = await supabaseAdmin.from('transactions').update({
    status: 'pending', gateway: 'mgm', gateway_status: result.status || 'created', gateway_status_code: result.status_code ?? null,
    gateway_status_detail: result.status_detail || null, gateway_order_id: result.order_id || orderId,
    gateway_payload: response, gateway_submitted_at: new Date().toISOString()
  }).eq('user_id', userId).eq('reference', orderId).eq('type', transactionType).eq('status', 'pending');
  if (error) throw error;
  return result;
}

async function getMode(key) {
  const { data } = await supabaseAdmin.from('settings').select('value').eq('key', key).maybeSingle();
  return data?.value === 'gateway' ? 'gateway' : 'manual';
}

async function getUser(req) {
  const header = req.headers.authorization;
  if (!header) throw Object.assign(new Error('No token provided'), { status: 401 });
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error } = await client.auth.getUser(header.replace('Bearer ', ''));
  if (error || !user) throw Object.assign(new Error('Invalid session'), { status: 401 });
  return user;
}

async function createDeposit(req, res) {
  const user = await getUser(req);
  const depositAmount = Number(req.body?.amount);
  const referenceText = String(req.body?.reference || '').trim();
  if (!Number.isFinite(depositAmount) || depositAmount <= 0 || !referenceText) return jsonResponse(res, 400, { error: 'A valid amount and payment reference are required' });

  const mode = await getMode('deposit_mode');
  const orderId = `DEP-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const { error: insertError } = await supabaseAdmin.from('transactions').insert({
    user_id: user.id, type: 'deposit', amount: depositAmount, description: referenceText, reference: orderId,
    status: 'pending', gateway: mode === 'gateway' ? 'mgm' : 'manual', gateway_status: mode === 'gateway' ? 'awaiting_gateway' : 'awaiting_admin'
  });
  if (insertError) throw insertError;

  if (mode === 'manual') return jsonResponse(res, 200, { success: true, mode, message: 'Deposit request submitted for admin verification.' });
  const result = await createMgmDeposit({ orderId, depositAmount, userId: user.id });
  return jsonResponse(res, 200, { success: true, mode, order_id: orderId, redirect_url: result.redirect_url, message: 'Continue to the MGM Pay cashier.' });
}

async function gatewayBalance(req, res) {
  await getAdminUser(req);
  const data = await queryGatewayBalance();
  return jsonResponse(res, 200, { success: true, data });
}

async function gatewayPayout(req, res) {
  const admin = await getAdminUser(req);
  const grossAmount = Number(req.body?.amount);
  const bankCode = String(req.body?.bank_code || '').trim();
  const accountNumber = String(req.body?.account_number || '').trim();
  const accountName = String(req.body?.account_name || '').trim();
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) return jsonResponse(res, 400, { error: 'Enter a valid gateway withdrawal amount' });
  if (!/^\d{5}$/.test(bankCode) || !/^\d{10}$/.test(accountNumber) || !accountName) return jsonResponse(res, 400, { error: 'Valid bank code, 10-digit account number, and account name are required' });

  const fee = Number((grossAmount * 0.095).toFixed(2));
  const payoutAmount = Number((grossAmount - fee).toFixed(2));
  if (payoutAmount <= 0) return jsonResponse(res, 400, { error: 'Amount is too small after the 9.5% gateway fee' });
  const orderId = `ADMIN-WD-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const description = `Gateway admin withdrawal | Gross: NGN ${grossAmount.toFixed(2)} | Fee 9.5%: NGN ${fee.toFixed(2)} | Net: NGN ${payoutAmount.toFixed(2)}`;
  const { error: insertError } = await supabaseAdmin.from('transactions').insert({
    user_id: admin.id, type: 'withdrawal', amount: payoutAmount, status: 'approved', reference: orderId,
    bank_code: bankCode, account_number: accountNumber, account_name: accountName,
    gateway: 'mgm_admin', gateway_status: 'submitting', description
  });
  if (insertError) throw insertError;

  const response = await createMgmPayout({ orderId, payoutAmount, accountName, accountNumber, bankCode });
  if (response?.state !== 'ok' || !response.data) {
    await supabaseAdmin.from('transactions').update({ status: 'rejected', gateway_status: 'submission_failed', gateway_payload: response }).eq('reference', orderId);
    return jsonResponse(res, 502, { error: response?.message || response?.error || 'MGM rejected the gateway withdrawal' });
  }
  const data = response.data;
  await supabaseAdmin.from('transactions').update({ gateway_status: data.status || 'accepted', gateway_status_code: data.status_code ?? null, gateway_status_detail: data.status_detail || null, gateway_order_id: data.order_id || orderId, gateway_settlement_id: data.settlement_id || null, gateway_payload: response, gateway_submitted_at: new Date().toISOString() }).eq('reference', orderId);
  return jsonResponse(res, 200, { success: true, order_id: orderId, gross_amount: grossAmount, fee, payout_amount: payoutAmount, message: 'Gateway withdrawal sent to MGM Pay.' });
}

async function gatewayTopup(req, res) {
  const admin = await getAdminUser(req);
  const depositAmount = Number(req.body?.amount);
  if (!Number.isFinite(depositAmount) || depositAmount <= 0) return jsonResponse(res, 400, { error: 'Enter a valid gateway top-up amount' });
  const orderId = `ADMIN-DEP-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const { error: insertError } = await supabaseAdmin.from('transactions').insert({
    user_id: admin.id, type: 'deposit', amount: depositAmount, status: 'pending', reference: orderId,
    gateway: 'mgm_admin', gateway_status: 'awaiting_gateway', description: 'Admin MGM merchant balance top-up'
  });
  if (insertError) throw insertError;
  const result = await createMgmDeposit({ orderId, depositAmount, userId: admin.id, transactionType: 'deposit' });
  return jsonResponse(res, 200, { success: true, order_id: orderId, redirect_url: result.redirect_url, message: 'Continue to MGM Pay to fund the gateway balance.' });
}

async function applyDepositCallback(data, body) {
  const code = Number(data.status_code);
  if (code !== TERMINAL_SUCCESS && !TERMINAL_FAILURES.has(code)) return;
  const { data: tx, error } = await supabaseAdmin.from('transactions').select('*').eq('type', 'deposit').eq('reference', String(data.order_id || '')).maybeSingle();
  if (error || !tx) throw new Error('Unknown deposit order');
  if (['completed', 'rejected'].includes(tx.status)) return;
  if (data.currency !== 'NGN' || Math.abs(Number(tx.amount) - Number(data.amount)) > 0.01) throw new Error('Deposit amount or currency mismatch');
  if (code === TERMINAL_SUCCESS) {
    if (tx.gateway === 'mgm_admin') {
      const { error: txUpdateError } = await supabaseAdmin.from('transactions').update({ status: 'completed', gateway_status: data.status || 'success', gateway_status_code: code, gateway_status_detail: data.status_detail || null, gateway_payload: body }).eq('id', tx.id).in('status', ['pending', 'approved']);
      if (txUpdateError) throw txUpdateError;
      return;
    }
    const { data: wallet, error: walletError } = await supabaseAdmin.from('wallets').select('balance, total_deposited').eq('user_id', tx.user_id).single();
    if (walletError || !wallet) throw new Error('Wallet not found for deposit');
    const { error: walletUpdateError } = await supabaseAdmin.from('wallets').update({ balance: Number(wallet.balance || 0) + Number(tx.amount), total_deposited: Number(wallet.total_deposited || 0) + Number(tx.amount) }).eq('user_id', tx.user_id);
    if (walletUpdateError) throw walletUpdateError;
    const { error: txUpdateError } = await supabaseAdmin.from('transactions').update({ status: 'completed', gateway_status: data.status || 'success', gateway_status_code: code, gateway_status_detail: data.status_detail || null, gateway_payload: body }).eq('id', tx.id).in('status', ['pending', 'approved']);
    if (txUpdateError) throw txUpdateError;
  } else {
    const { error: txUpdateError } = await supabaseAdmin.from('transactions').update({ status: 'rejected', gateway_status: data.status || 'failed', gateway_status_code: code, gateway_status_detail: data.status_detail || null, gateway_payload: body }).eq('id', tx.id).in('status', ['pending', 'approved']);
    if (txUpdateError) throw txUpdateError;
  }
}

async function applyWithdrawalCallback(data, body) {
  const code = Number(data.status_code);
  if (code !== TERMINAL_SUCCESS && !TERMINAL_FAILURES.has(code)) return;
  const { data: tx, error } = await supabaseAdmin.from('transactions').select('*').eq('type', 'withdrawal').eq('reference', String(data.order_id || '')).maybeSingle();
  if (error || !tx) throw new Error('Unknown withdrawal order');
  if (['completed', 'rejected'].includes(tx.status)) return;
  if (tx.status === 'approved' && !['mgm', 'mgm_admin'].includes(tx.gateway)) return;
  if (data.currency !== 'NGN' || Math.abs(Number(tx.amount) - Number(data.amount)) > 0.01) throw new Error('Withdrawal amount or currency mismatch');
  if (code === TERMINAL_SUCCESS) {
    const { error: txError } = await supabaseAdmin.from('transactions').update({ status: 'completed', gateway_status: data.status || 'success', gateway_status_code: code, gateway_status_detail: data.status_detail || null, gateway_settlement_id: data.settlement_id || tx.gateway_settlement_id || null, gateway_payload: body }).eq('id', tx.id).in('status', ['pending', 'approved']);
    if (txError) throw txError;
    if (tx.gateway === 'mgm_admin') return;
    const { data: wallet, error: walletError } = await supabaseAdmin.from('wallets').select('total_withdrawn').eq('user_id', tx.user_id).single();
    if (walletError || !wallet) throw new Error('Wallet not found while finalizing payout');
    const { error: walletUpdateError } = await supabaseAdmin.from('wallets').update({ total_withdrawn: Number(wallet.total_withdrawn || 0) + Number(tx.amount) }).eq('user_id', tx.user_id);
    if (walletUpdateError) throw walletUpdateError;
  } else {
    const { error: txError } = await supabaseAdmin.from('transactions').update({ status: 'rejected', gateway_status: data.status || 'failed', gateway_status_code: code, gateway_status_detail: data.status_detail || null, gateway_payload: body, gateway_refunded_at: new Date().toISOString() }).eq('id', tx.id).in('status', ['pending', 'approved']);
    if (txError) throw txError;
    if (tx.gateway === 'mgm_admin') return;
    const { data: wallet, error: walletError } = await supabaseAdmin.from('wallets').select('balance').eq('user_id', tx.user_id).single();
    if (walletError || !wallet) throw new Error('Wallet not found while refunding payout');
    const { error: walletUpdateError } = await supabaseAdmin.from('wallets').update({ balance: Number(wallet.balance || 0) + Number(tx.amount) }).eq('user_id', tx.user_id);
    if (walletUpdateError) throw walletUpdateError;
    await supabaseAdmin.from('transactions').insert({ user_id: tx.user_id, type: 'withdrawal_refund', amount: Number(tx.amount), status: 'completed', reference: `REFUND-${tx.reference}`, description: `MGM Pay withdrawal failed: ${data.status_detail || 'Payout returned'}` });
  }
}

async function callback(req, res, type) {
  const body = req.body || {};
  const data = body.data && typeof body.data === 'object' ? body.data : body;
  const key = required(type === 'deposit' ? 'MGM_COLLECTION_KEY' : 'MGM_PAYOUT_KEY');
  if (!sameSignature(mgmSignature(data, key), data.signature)) return res.status(401).send('INVALID SIGNATURE');
  if (type === 'deposit') await applyDepositCallback(data, body); else await applyWithdrawalCallback(data, body);
  return res.status(200).send('SUCCESS');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });
  const action = req.query?.action || req.body?.action;
  try {
    if (action === 'create_deposit') return await createDeposit(req, res);
    if (action === 'gateway_balance') return await gatewayBalance(req, res);
    if (action === 'gateway_payout') return await gatewayPayout(req, res);
    if (action === 'gateway_topup') return await gatewayTopup(req, res);
    if (action === 'deposit_callback') return await callback(req, res, 'deposit');
    if (action === 'withdrawal_callback') return await callback(req, res, 'withdrawal');
    return jsonResponse(res, 400, { error: 'Unsupported MGM action' });
  } catch (error) {
    console.error('MGM API ERROR:', error);
    return jsonResponse(res, error.status || 500, { error: error.message || 'MGM request failed' });
  }
}
