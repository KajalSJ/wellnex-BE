# Stripe Webhook Setup Guide

## Overview
This guide will help you set up Stripe webhooks for your Wellnex application to handle subscription events automatically.

## Current Setup
Your application already has:
- ✅ Webhook route at `/webhook/stripe`
- ✅ Raw body parsing for Stripe webhooks
- ✅ Enhanced webhook event handler
- ✅ Test endpoint at `/webhook/stripe/test`

## Step 1: Environment Variables
Add these to your `.env` file:

```env
STRIPE_SECRET_KEY=sk_test_... # Your Stripe secret key
STRIPE_WEBHOOK_SECRET=whsec_... # Will be provided by Stripe
```

## Step 2: Configure Stripe Webhook Endpoint

### In Stripe Dashboard:
1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to **Developers** → **Webhooks**
3. Click **Add endpoint**
4. Set the endpoint URL to: `https://your-domain.com/webhook/stripe`
5. Select these events to listen for:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.paused`
   - `customer.subscription.resumed`
   - `customer.subscription.trial_will_end`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
6. Click **Add endpoint**
7. Copy the **Signing secret** (starts with `whsec_`)
8. Add it to your `.env` file as `STRIPE_WEBHOOK_SECRET`

## Step 3: Test Your Webhook

### Test the endpoint is accessible:
```bash
curl https://your-domain.com/webhook/stripe/test
```

Expected response:
```json
{
  "message": "Webhook endpoint is working!",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "webhookSecret": "Configured"
}
```

### Test with Stripe CLI (Recommended):
1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
2. Login: `stripe login`
3. Forward webhooks to your local server:
   ```bash
   stripe listen --forward-to localhost:3000/webhook/stripe
   ```
4. This will give you a webhook secret starting with `whsec_`
5. Use this secret in your `.env` file for local testing

## Step 4: Verify Webhook Events

The webhook handler will now process these events:

### Subscription Events:
- **Created**: Creates new subscription record
- **Updated**: Updates subscription status and periods
- **Deleted**: Marks subscription as canceled
- **Paused**: Marks subscription as paused
- **Resumed**: Marks subscription as active

### Payment Events:
- **Payment Succeeded**: Updates subscription to active
- **Payment Failed**: Updates subscription to past_due

### Trial Events:
- **Trial Will End**: Logs trial ending (add email notifications as needed)

## Step 5: Monitor Webhook Events

Check your server logs for webhook processing:
```bash
# Look for these log messages:
Processing webhook event: customer.subscription.created
Subscription created: sub_1234567890
Processing webhook event: invoice.payment_succeeded
Payment succeeded for invoice: in_1234567890
```

## Troubleshooting

### Common Issues:

1. **"No Stripe signature found"**
   - Ensure you're using the correct webhook secret
   - Check that the endpoint URL is correct

2. **"Invalid request body format"**
   - Ensure raw body parsing is enabled for webhook routes
   - Check that no other middleware is parsing the body

3. **"Webhook signature verification failed"**
   - Verify the webhook secret is correct
   - Ensure the secret starts with `whsec_` or `we_`

4. **Webhook not receiving events**
   - Check that the endpoint URL is publicly accessible
   - Verify the events are selected in Stripe dashboard
   - Check server logs for any errors

### Testing Locally:
1. Use Stripe CLI to forward webhooks
2. Use ngrok to expose your local server
3. Test with Stripe's webhook testing tool

## Security Best Practices

1. **Always verify webhook signatures** ✅ (Already implemented)
2. **Use HTTPS in production** ✅ (Required by Stripe)
3. **Keep webhook secrets secure** ✅ (Use environment variables)
4. **Handle webhook failures gracefully** ✅ (Error handling implemented)
5. **Log webhook events for debugging** ✅ (Console logging implemented)

## Next Steps

1. Set up email notifications for important events
2. Add webhook event monitoring/alerting
3. Implement retry logic for failed webhook processing
4. Add webhook event analytics

## Support

If you encounter issues:
1. Check the server logs for detailed error messages
2. Verify your Stripe dashboard configuration
3. Test with Stripe CLI for local debugging
4. Review Stripe's webhook documentation: https://stripe.com/docs/webhooks 