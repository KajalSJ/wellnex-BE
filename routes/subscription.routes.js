import express from 'express';
import { createSubscription, cancelSubscription, getActiveSubscription, getSavedCards, getSubscriptionPlans, removeSavedCard, applySpecialOffer, getProductPrices, renewSubscriptionAfterSpecialOffer, setDefaultCard, updateCardDetails, updatePreferredCurrency } from '../services/subscription.service.js';
import jwtMiddleware from '../middlewares/jwt.middleware.js';

const router = express.Router();
const { verifyToken: jwtAuthGuard } = jwtMiddleware;

// Create subscription
router.post('/create', jwtAuthGuard, async (req, res) => {
    try {
        const { paymentMethodId, priceId } = req.body;

        if (!paymentMethodId || !priceId) {
            return res.status(400).json({
                message: 'Missing required parameters: paymentMethodId and priceId are required'
            });
        }

        const result = await createSubscription(req.user._id, paymentMethodId, priceId);
        res.json(result);
    } catch (error) {
        console.error('Error creating subscription:', error);
        res.status(400).json({ message: error.message });
    }
});

// Cancel subscription
router.post('/cancel', jwtAuthGuard, async (req, res) => {
    try {
        const result = await cancelSubscription(req.user._id);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get active subscription
router.get('/status', jwtAuthGuard, async (req, res) => {
    try {
        const subscription = await getActiveSubscription(req.user._id);
        res.json(subscription);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get saved cards
router.get('/cards', jwtAuthGuard, async (req, res) => {
    try {
        const cards = await getSavedCards(req.user._id);
        res.json(cards);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.delete('/cards/:cardId', jwtAuthGuard, async (req, res) => {
    try {
        const result = await removeSavedCard(req.user._id, req.params.cardId);
        res.json(result);
    } catch (error) {
        console.error('Error removing card:', error);
        res.status(400).json({ message: error.message });
    }
});

// Set default card
router.post('/cards/:cardId/default', jwtAuthGuard, async (req, res) => {
    try {
        const result = await setDefaultCard(req.user._id, req.params.cardId);
        res.json(result);
    } catch (error) {
        console.error('Error setting default card:', error);
        res.status(400).json({ message: error.message });
    }
});

// Update card details
router.put('/cards/:cardId', jwtAuthGuard, async (req, res) => {
    try {
        const { exp_month, exp_year, name, email, phone, address } = req.body;

        // Validate required fields
        if (!exp_month || !exp_year) {
            return res.status(400).json({
                message: 'Missing required fields: exp_month and exp_year are required'
            });
        }

        const cardDetails = {
            exp_month,
            exp_year,
            name,
            email,
            phone,
            address
        };

        const result = await updateCardDetails(req.user._id, req.params.cardId, cardDetails);
        res.json(result);
    } catch (error) {
        console.error('Error updating card details:', error);
        res.status(400).json({ message: error.message });
    }
});

router.get('/plans', jwtAuthGuard, async (req, res) => {
    try {
        const plans = await getSubscriptionPlans(req.user._id);
        res.json(plans);
    } catch (error) {
        console.error('Error fetching subscription plans:', error);
        res.status(500).json({ message: 'Error fetching subscription plans' });
    }
});

// Apply special offer
router.post('/apply-special-offer', jwtAuthGuard, async (req, res) => {
    try {
        const result = await applySpecialOffer(req.user._id);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get prices for a specific product
router.get('/products/:productId/prices', jwtAuthGuard, async (req, res) => {
    try {
        const prices = await getProductPrices(req.params.productId);
        res.json(prices);
    } catch (error) {
        console.error('Error fetching product prices:', error);
        res.status(500).json({ message: error.message });
    }
});

// Renew subscription after special offer
router.post('/renew-after-special-offer', jwtAuthGuard, async (req, res) => {
    try {
        const { paymentMethodId } = req.body;

        if (!paymentMethodId) {
            return res.status(400).json({
                message: 'Missing required parameter: paymentMethodId is required'
            });
        }

        const result = await renewSubscriptionAfterSpecialOffer(req.user._id, paymentMethodId);
        res.json(result);
    } catch (error) {
        console.error('Error renewing subscription:', error);
        res.status(400).json({ message: error.message });
    }
});

router.post('/update-preferred-currency', jwtAuthGuard, async (req, res) => {
    try {
        const { currencyId } = req.body;
        const userId = req.user._id;
        const result = await updatePreferredCurrency(userId, currencyId);
        res.json(result);
    } catch (error) {
        res.status(400).json({
            status: false,
            message: error.message,
            data: null
        });
    }
});

export default router; 