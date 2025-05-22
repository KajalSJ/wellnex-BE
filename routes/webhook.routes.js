import express from 'express';
import Stripe from 'stripe';
import { handleWebhookEvent } from '../services/subscription.service.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    console.log(sig, "sig");

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        await handleWebhookEvent(event);
        res.json({ received: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router; 