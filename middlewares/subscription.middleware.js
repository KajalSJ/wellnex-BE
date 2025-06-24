import Subscription from '../models/subscription.model.js';

/**
 * Middleware to check if user has active subscription for dashboard access
 */
const checkSubscriptionAccess = async (req, res, next) => {
    try {
        const userId = req.user?._id;

        if (!userId) {
            return res.status(401).json({
                status: false,
                message: 'Authentication required',
                canAccessDashboard: false
            });
        }

        // Check for active subscription (regular or special offer)
        const subscription = await Subscription.findOne({
            userId,
            status: { $in: ['active', 'trialing'] },
            currentPeriodEnd: { $gte: new Date() }
        });

        if (subscription) {
            // User has active subscription
            req.subscription = subscription;
            req.canAccessDashboard = true;
            req.subscriptionType = subscription.isSpecialOffer ? 'Special Offer' : 'Regular';
            return next();
        }

        // Check for paused subscription
        const pausedSubscription = await Subscription.findOne({
            userId,
            status: 'paused'
        });

        if (pausedSubscription) {
            return res.status(403).json({
                status: false,
                message: 'Your subscription is paused. Please contact admin to resume access.',
                canAccessDashboard: false,
                subscriptionType: pausedSubscription.isSpecialOffer ? 'Special Offer' : 'Regular',
                subscriptionStatus: 'paused'
            });
        }

        // Check for canceled subscription
        const canceledSubscription = await Subscription.findOne({
            userId,
            status: 'canceled',
            currentPeriodEnd: { $gte: new Date() }
        });

        if (canceledSubscription) {
            return res.status(403).json({
                status: false,
                message: 'Your subscription has been canceled. Please contact admin to restore access.',
                canAccessDashboard: false,
                subscriptionType: canceledSubscription.isSpecialOffer ? 'Special Offer' : 'Regular',
                subscriptionStatus: 'canceled'
            });
        }

        // No subscription found
        return res.status(403).json({
            status: false,
            message: 'No active subscription found. Please subscribe to access dashboard features.',
            canAccessDashboard: false,
            subscriptionType: null,
            subscriptionStatus: 'none'
        });

    } catch (error) {
        console.error('Error checking subscription access:', error);
        return res.status(500).json({
            status: false,
            message: 'Error checking subscription status',
            canAccessDashboard: false
        });
    }
};

/**
 * Middleware to check if user has any subscription (active, paused, or canceled)
 */
const checkAnySubscription = async (req, res, next) => {
    try {
        const userId = req.user?._id;

        if (!userId) {
            return res.status(401).json({
                status: false,
                message: 'Authentication required'
            });
        }

        // Check for any subscription
        const subscription = await Subscription.findOne({
            userId
        }).sort({ createdAt: -1 });

        if (subscription) {
            req.subscription = subscription;
            req.hasSubscription = true;
            req.subscriptionType = subscription.isSpecialOffer ? 'Special Offer' : 'Regular';
            return next();
        }

        // No subscription found
        req.hasSubscription = false;
        req.subscriptionType = null;
        return next();

    } catch (error) {
        console.error('Error checking subscription:', error);
        return res.status(500).json({
            status: false,
            message: 'Error checking subscription status'
        });
    }
};

/**
 * Middleware to check if user can manage their subscription
 */
const checkSubscriptionManagement = async (req, res, next) => {
    try {
        const userId = req.user?._id;

        if (!userId) {
            return res.status(401).json({
                status: false,
                message: 'Authentication required'
            });
        }

        // Check for any active or paused subscription
        const subscription = await Subscription.findOne({
            userId,
            status: { $in: ['active', 'trialing', 'paused'] }
        });

        if (!subscription) {
            return res.status(403).json({
                status: false,
                message: 'No subscription found to manage'
            });
        }

        // Check if it's a special offer subscription
        if (subscription.isSpecialOffer) {
            return res.status(403).json({
                status: false,
                message: 'Special offer subscriptions cannot be managed by users. Please contact admin.',
                subscriptionType: 'Special Offer'
            });
        }

        req.subscription = subscription;
        req.canManageSubscription = true;
        return next();

    } catch (error) {
        console.error('Error checking subscription management:', error);
        return res.status(500).json({
            status: false,
            message: 'Error checking subscription management permissions'
        });
    }
};

const subscriptionMiddleware = {
    checkSubscriptionAccess,
    checkAnySubscription,
    checkSubscriptionManagement
};

export default subscriptionMiddleware; 