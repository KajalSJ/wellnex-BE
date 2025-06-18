import express from 'express';
import Stripe from 'stripe';
import { handleWebhookEvent } from '../services/subscription.service.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (!endpointSecret || (!endpointSecret.startsWith('whsec_') && !endpointSecret.startsWith('we_'))) {
    console.error('Invalid webhook secret. Make sure STRIPE_WEBHOOK_SECRET is set correctly in your environment variables.');
    console.error('The secret should start with whsec_ or we_');
    console.error('Current secret:', endpointSecret);
}

// Important: This route must be before any body parsing middleware
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];

    if (!sig) {
        console.error('No Stripe signature found in request headers');
        return res.status(400).send('No Stripe signature found');
    }

    if (!endpointSecret || (!endpointSecret.startsWith('whsec_') && !endpointSecret.startsWith('we_'))) {
        console.error('Invalid webhook secret configuration');
        console.error('Current secret:', endpointSecret);
        console.error('Expected format: whsec_... or we_...');
        return res.status(500).send('Webhook secret not configured correctly');
    }

    let event;

    try {
        // Ensure we're using the raw body buffer
        const rawBody = req.body;
        
        // Additional validation
        if (!Buffer.isBuffer(rawBody)) {
            console.error('Request body is not a Buffer');
            return res.status(400).send('Invalid request body format');
        }

        event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        console.error('Error details:', {
            signature: sig,
            secretLength: endpointSecret?.length,
            bodyLength: req.body?.length,
            secretPrefix: endpointSecret?.substring(0, 3)
        });
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        await handleWebhookEvent(event);
        res.json({ received: true });
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router; 