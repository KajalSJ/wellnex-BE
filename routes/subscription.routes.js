import express from 'express';
import { createSubscription, cancelSubscription, getSavedCards, getSubscriptionPlans, removeSavedCard, applySpecialOffer, checkSpecialOfferPrice, getProductPrices, renewSubscriptionAfterSpecialOffer, setDefaultCard, updateCardDetails, updatePreferredCurrency, changeSubscriptionCard } from '../services/subscription.service.js';
import jwtMiddleware from '../middlewares/jwt.middleware.js';
import subscriptionMiddleware from '../middlewares/subscription.middleware.js';
import Subscription from '../models/subscription.model.js';
import businessService from '../services/business.service.js';
const { verifyToken: jwtAuthGuard } = jwtMiddleware;
const { checkSubscriptionAccess, checkAnySubscription, checkSubscriptionManagement } = subscriptionMiddleware;
const { retriveBusiness } = businessService;

const router = express.Router();

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

// Cancel subscription - requires subscription management permission
router.post('/cancel', jwtAuthGuard, checkSubscriptionManagement, async (req, res) => {
    try {
        const result = await cancelSubscription(req.user._id);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get active subscription - requires subscription access
router.get('/status', jwtAuthGuard, checkSubscriptionAccess, async (req, res) => {
    try {
        let existingBusiness = await retriveBusiness({
            _id: req.user._id,
        });
        if (!existingBusiness) {
            throw new Error('Business not found');
        }

        // Get the single active or most recent subscription for the business
        const subscription = await Subscription.findOne({
            userId: req.user._id
        }).sort({ currentPeriodEnd: -1 });
        if (subscription) {
            res.json({
                ...subscription._doc,
                email: existingBusiness.email,
                canAccessDashboard: req.canAccessDashboard,
                subscriptionType: req.subscriptionType
            });
        } else {
            res.json({
                currentPeriodStart: null,
                currentPeriodEnd: null,
                email: existingBusiness.email,
                canAccessDashboard: false,
                subscriptionType: null
            });
        }
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get saved cards - requires subscription access
router.get('/cards', jwtAuthGuard, checkSubscriptionAccess, async (req, res) => {
    try {
        const cards = await getSavedCards(req.user._id);
        res.json(cards);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Remove saved card - requires subscription access
router.delete('/cards/:cardId', jwtAuthGuard, checkSubscriptionAccess, async (req, res) => {
    try {
        const result = await removeSavedCard(req.user._id, req.params.cardId);
        res.json(result);
    } catch (error) {
        console.error('Error removing card:', error);
        res.status(400).json({ message: error.message });
    }
});

// Set default card - requires subscription access
router.post('/cards/:cardId/default', jwtAuthGuard, checkSubscriptionAccess, async (req, res) => {
    try {
        const result = await setDefaultCard(req.user._id, req.params.cardId);
        res.json(result);
    } catch (error) {
        console.error('Error setting default card:', error);
        res.status(400).json({ message: error.message });
    }
});

// Update card details - requires subscription access
router.put('/cards/:cardId', jwtAuthGuard, checkSubscriptionAccess, async (req, res) => {
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

// Get subscription plans - requires any subscription check
router.get('/plans', jwtAuthGuard, checkAnySubscription, async (req, res) => {
    try {
        const plans = await getSubscriptionPlans(req.user._id);
        res.json(plans);
    } catch (error) {
        console.error('Error fetching subscription plans:', error);
        res.status(500).json({ message: 'Error fetching subscription plans' });
    }
});

// Check special offer - requires subscription management permission
router.get('/check-special-offer', jwtAuthGuard, checkSubscriptionManagement, async (req, res) => {
    try {
        const result = await checkSpecialOfferPrice(req.user._id);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Apply special offer - requires subscription management permission
router.post('/apply-special-offer', jwtAuthGuard, checkSubscriptionManagement, async (req, res) => {
    try {
        const result = await applySpecialOffer(req.user._id);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get prices for a specific product - requires subscription access
router.get('/products/:productId/prices', jwtAuthGuard, checkSubscriptionAccess, async (req, res) => {
    try {
        const prices = await getProductPrices(req.params.productId);
        res.json(prices);
    } catch (error) {
        console.error('Error fetching product prices:', error);
        res.status(500).json({ message: error.message });
    }
});

// Renew subscription after special offer - requires subscription access
router.post('/renew-after-special-offer', jwtAuthGuard, checkSubscriptionAccess, async (req, res) => {
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

// Update preferred currency - requires subscription access
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

// Change subscription card - requires subscription management permission
router.post('/change-card', jwtAuthGuard, checkSubscriptionManagement, async (req, res) => {
    try {
        const { paymentMethodId } = req.body;

        if (!paymentMethodId) {
            return res.status(400).json({
                message: 'Missing required parameter: paymentMethodId is required'
            });
        }

        const result = await changeSubscriptionCard(req.user._id, paymentMethodId);
        res.json(result);
    } catch (error) {
        console.error('Error changing subscription card:', error);
        res.status(400).json({ message: error.message });
    }
});

export default router; 