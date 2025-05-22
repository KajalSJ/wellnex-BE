import Stripe from 'stripe';
import Subscription from '../models/subscription.model.js';
import Business from '../models/business.model.js';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const createSubscription = async (userId, paymentMethodId, priceId) => {
    try {
        const user = await Business.findById({ _id: userId });
        if (!user) {
            throw new Error('User not found');
        }

        // Get price details from Stripe
        const price = await stripe.prices.retrieve(priceId);
        if (!price) {
            throw new Error('Invalid price ID');
        }

        // Get payment method details to check for duplicates
        const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
        
        // Get all saved payment methods for the customer
        const savedPaymentMethods = await stripe.paymentMethods.list({
            customer: user.stripeCustomerId,
            type: 'card',
        });

        // Check if this card is already saved
        const isDuplicate = savedPaymentMethods.data.some(savedMethod => 
            savedMethod.card.fingerprint === paymentMethod.card.fingerprint
        );

        let finalPaymentMethodId = paymentMethodId;

        if (!isDuplicate) {
            // Attach the payment method to the customer
            await stripe.paymentMethods.attach(paymentMethodId, {
                customer: user.stripeCustomerId,
            });
        } else {
            // If it's a duplicate, find the existing payment method ID
            const existingMethod = savedPaymentMethods.data.find(
                savedMethod => savedMethod.card.fingerprint === paymentMethod.card.fingerprint
            );
            if (existingMethod) {
                finalPaymentMethodId = existingMethod.id;
            }
        }

        // Set as default payment method
        await stripe.customers.update(user.stripeCustomerId, {
            invoice_settings: {
                default_payment_method: finalPaymentMethodId,
            },
        });

        // Create subscription
        const subscription = await stripe.subscriptions.create({
            customer: user.stripeCustomerId,
            items: [{ price: priceId }],
            payment_behavior: 'error_if_incomplete',
            payment_settings: { save_default_payment_method: 'on_subscription' },
            expand: ['latest_invoice.payment_intent'],
        });

        // Save subscription details to database
        const subscriptionData = {
            userId,
            stripeSubscriptionId: subscription.id,
            stripeCustomerId: user.stripeCustomerId,
            paymentMethodId: finalPaymentMethodId,
            status: subscription.status,
            priceId: priceId,
            amount: price.unit_amount / 100,
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        };

        await Subscription.create(subscriptionData);

        return {
            subscriptionId: subscription.id,
            clientSecret: subscription.latest_invoice.payment_intent.client_secret,
            isNewCard: !isDuplicate
        };
    } catch (error) {
        console.error('Error in createSubscription:', error);
        throw error;
    }
};

export const removeSavedCard = async (userId, paymentMethodId) => {
    try {
        const user = await Business.findById({ _id: userId });
        if (!user) {
            throw new Error('User not found');
        }

        // Detach the payment method from the customer
        await stripe.paymentMethods.detach(paymentMethodId);

        return { success: true, message: 'Card removed successfully' };
    } catch (error) {
        console.error('Error removing card:', error);
        throw error;
    }
};

export const setDefaultCard = async (userId, paymentMethodId) => {
    try {
        const user = await Business.findById({ _id: userId });
        if (!user) {
            throw new Error('User not found');
        }

        // Update customer's default payment method
        await stripe.customers.update(user.stripeCustomerId, {
            invoice_settings: {
                default_payment_method: paymentMethodId,
            },
        });

        return { success: true, message: 'Default card updated successfully' };
    } catch (error) {
        console.error('Error setting default card:', error);
        throw error;
    }
};


export const cancelSubscription = async (userId) => {
    try {
        // Find the active subscription
        const subscription = await Subscription.findOne({
            userId,
            status: { $in: ['active', 'trialing'] }
        });

        if (!subscription) {
            throw new Error('No active subscription found');
        }

        // Cancel the subscription in Stripe
        const stripeSubscription = await stripe.subscriptions.update(
            subscription.stripeSubscriptionId,
            { cancel_at_period_end: true }
        );

        // Update the subscription in our database
        subscription.cancelAtPeriodEnd = true;
        subscription.status = stripeSubscription.status;
        await subscription.save();

        return {
            success: true,
            message: 'Subscription will be canceled at the end of the billing period',
            cancelAtPeriodEnd: true,
            currentPeriodEnd: subscription.currentPeriodEnd
        };
    } catch (error) {
        console.error('Error canceling subscription:', error);
        throw new Error(`Error canceling subscription: ${error.message}`);
    }
};

export const getActiveSubscription = async (userId) => {
    try {
        const subscription = await Subscription.findOne({
            userId,
            status: 'active',
            currentPeriodEnd: { $gt: new Date() }
        });
        return subscription;
    } catch (error) {
        throw new Error(`Error getting subscription: ${error.message}`);
    }
};

export const handleWebhookEvent = async (event) => {
    try {
        switch (event.type) {
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted':
                const subscription = event.data.object;
                await Subscription.findOneAndUpdate(
                    { stripeSubscriptionId: subscription.id },
                    {
                        status: subscription.status,
                        currentPeriodStart: new Date(subscription.current_period_start * 1000),
                        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
                        cancelAtPeriodEnd: subscription.cancel_at_period_end
                    }
                );
                break;
        }
    } catch (error) {
        throw new Error(`Error handling webhook: ${error.message}`);
    }
};

export const getSavedCards = async (userId) => {
    try {
        const user = await Business.findById({_id: userId});
        if (!user) {
            throw new Error('User not found');
        }

        // Get all saved payment methods for the customer
        const paymentMethods = await stripe.paymentMethods.list({
            customer: user.stripeCustomerId,
            type: 'card',
        });

        // Get customer to check default payment method
        const customer = await stripe.customers.retrieve(user.stripeCustomerId);

        // Format the response
        const cards = paymentMethods.data.map(card => ({
            id: card.id,
            brand: card.card.brand,
            last4: card.card.last4,
            exp_month: card.card.exp_month,
            exp_year: card.card.exp_year,
            isDefault: card.id === customer.invoice_settings.default_payment_method,
        }));

        return cards;
    } catch (error) {
        console.error('Error getting saved cards:', error);
        throw error;
    }
};

export const getSubscriptionPlans = async () => {
    try {
        // Fetch all active prices with their associated products
        const prices = await stripe.prices.list({
            active: true,
            expand: ['data.product'],
            type: 'recurring'
        });

        // Format the plans data
        const plans = prices.data.map(price => ({
            id: price.id,
            productId: price.product.id,
            name: price.product.name,
            description: price.product.description,
            amount: price.unit_amount / 100, // Convert from cents
            currency: price.currency,
            interval: price.recurring.interval,
            features: price.product.metadata.features ?
                JSON.parse(price.product.metadata.features) : [],
            isPopular: price.product.metadata.isPopular === 'true'
        }));

        return plans;
    } catch (error) {
        throw new Error(`Error fetching subscription plans: ${error.message}`);
    }
}; 