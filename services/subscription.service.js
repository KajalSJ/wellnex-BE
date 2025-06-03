import Stripe from 'stripe';
import Subscription from '../models/subscription.model.js';
import Business from '../models/business.model.js';
import awsEmailExternal from '../externals/send.email.external.js';
import businessService from './business.service.js';
import currencyModel from '../models/currency.model.js';
import path from 'path';
import __dirname from "../configurations/dir.config.js";
import responseHelper from '../helpers/response.helper.js';
const { send400, } = responseHelper;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const { sendingMail } = awsEmailExternal,
    { retriveBusiness } = businessService;

export const createStripeCustomer = async (userId) => {
    try {
        const user = await Business.findById({ _id: userId });
        if (!user) {
            throw new Error('User not found');
        }

        // If user already has a Stripe customer ID, return it
        if (user.stripeCustomerId) {
            return user.stripeCustomerId;
        }

        // Create a new customer in Stripe
        const customer = await stripe.customers.create({
            email: user.email,
            name: user.name,
            metadata: {
                userId: userId.toString()
            }
        });

        // Update user with Stripe customer ID
        user.stripeCustomerId = customer.id;
        await user.save();

        return customer.id;
    } catch (error) {
        console.error('Error creating Stripe customer:', error);
        throw error;
    }
};

export const createSubscription = async (userId, paymentMethodId, priceId) => {
    try {
        const business = await Business.findById({ _id: userId }).populate('preferredCurrency');
        if (!business) {
            throw new Error('Business not found');
        }
        const subscriptionActive = await Subscription.findOne({
            userId: userId,
            status: { $in: ['active', 'trialing'] },
            currentPeriodEnd: { $gt: new Date() }
        });
        if (subscriptionActive) {
            return send400(res, {
                status: false,
                message: "Business already has an active subscription",
                data: subscriptionActive,
            });
        }
        // Get the price from Stripe to verify currency
        const price = await stripe.prices.retrieve(priceId);

        // Verify if the price currency matches the business's preferred currency
        if (price.currency.toLowerCase() !== business.preferredCurrency.code.toLowerCase()) {
            throw new Error(`Price currency (${price.currency}) does not match business preferred currency (${business.preferredCurrency.code})`);
        }

        // Get payment method details to check for duplicates
        const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
        let finalPaymentMethodId = paymentMethodId;
        let isDuplicate = false;

        // Create or get customer
        let customer;
        if (business.stripeCustomerId) {
            customer = await stripe.customers.retrieve(business.stripeCustomerId);

            // Check for any existing subscriptions
            const existingSubscriptions = await stripe.subscriptions.list({
                customer: business.stripeCustomerId,
                status: 'active',
                limit: 100
            });

            // Check for subscription schedules
            const subscriptionSchedules = await stripe.subscriptionSchedules.list({
                customer: business.stripeCustomerId,
                limit: 100
            });

            // Check for quotes
            const quotes = await stripe.quotes.list({
                customer: business.stripeCustomerId,
                status: 'open',
                limit: 100
            });

            // Check for invoice items
            const invoiceItems = await stripe.invoiceItems.list({
                customer: business.stripeCustomerId,
                limit: 100
            });

            // Check all resources for currency conflicts
            const checkCurrency = (resource, resourceType) => {
                if (resource.currency && resource.currency.toLowerCase() !== price.currency.toLowerCase()) {
                    throw new Error(`Cannot create subscription in ${price.currency} because customer has an active ${resourceType} in ${resource.currency}. Please cancel or complete all existing ${resourceType}s first.`);
                }
            };

            // Check subscriptions
            for (const sub of existingSubscriptions.data) {
                const subPrice = await stripe.prices.retrieve(sub.items.data[0].price.id);
                checkCurrency(subPrice, 'subscription');
            }

            // Check subscription schedules
            for (const schedule of subscriptionSchedules.data) {
                if (schedule.phases && schedule.phases[0].items) {
                    for (const item of schedule.phases[0].items) {
                        const schedulePrice = await stripe.prices.retrieve(item.price);
                        checkCurrency(schedulePrice, 'subscription schedule');
                    }
                }
            }

            // Check quotes
            for (const quote of quotes.data) {
                checkCurrency(quote, 'quote');
            }

            // Check invoice items
            for (const item of invoiceItems.data) {
                checkCurrency(item, 'invoice item');
            }

            // Get all saved payment methods for the customer
            const savedPaymentMethods = await stripe.paymentMethods.list({
                customer: business.stripeCustomerId,
                type: 'card',
            });

            // Check if this card is already saved
            isDuplicate = savedPaymentMethods.data.some(savedMethod =>
                savedMethod.card.fingerprint === paymentMethod.card.fingerprint
            );

            if (!isDuplicate) {
                // Attach the payment method to the customer
                await stripe.paymentMethods.attach(paymentMethodId, {
                    customer: business.stripeCustomerId,
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
            await stripe.customers.update(business.stripeCustomerId, {
                invoice_settings: {
                    default_payment_method: finalPaymentMethodId,
                },
            });
        } else {
            customer = await stripe.customers.create({
                email: business.email,
                payment_method: paymentMethodId,
                invoice_settings: {
                    default_payment_method: paymentMethodId,
                },
            });
            business.stripeCustomerId = customer.id;
            await business.save();
        }

        // Create subscription
        const subscription = await stripe.subscriptions.create({
            customer: customer.id,
            items: [{ price: priceId }],
            payment_behavior: 'error_if_incomplete',
            payment_settings: {
                save_default_payment_method: 'on_subscription',
                payment_method_types: ['card'],
            },
            expand: ['latest_invoice.payment_intent'],
            collection_method: 'charge_automatically',
        });

        // Save subscription details to database
        const subscriptionData = {
            userId,
            stripeSubscriptionId: subscription.id,
            stripeCustomerId: business.stripeCustomerId,
            paymentMethodId: finalPaymentMethodId,
            status: subscription.status,
            priceId: priceId,
            amount: price.unit_amount / 100,
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        };

        await Subscription.create(subscriptionData);

        // Send payment confirmation email
        const today = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        await sendingMail({
            email: business.email,
            sub: `WellnexAI Payment Receipt – ${today}`,
            text: `Hi ${business.name},\n\nThis is a confirmation that your payment of ${price.unit_amount / 100} ${price.currency.toUpperCase()} has been processed successfully.\n\nPlan: Monthly Subscription\nAmount: ${price.unit_amount / 100} ${price.currency.toUpperCase()}\nDate: ${today}\n\nYou can view or manage your billing at any time via your Dashboard.\n\nQuestions? Email support@wellnexai.com\n\nThanks for being part of the WellnexAI community!`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">WellnexAI Payment Receipt – ${today}</h2>
                    <p>Hi ${business.name},</p>
                    <p>This is a confirmation that your payment of <strong>${price.unit_amount / 100} ${price.currency.toUpperCase()}</strong> has been processed successfully.</p>
                    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Plan:</strong> Monthly Subscription</p>
                        <p style="margin: 5px 0;"><strong>Amount:</strong> ${price.unit_amount / 100} ${price.currency.toUpperCase()}</p>
                        <p style="margin: 5px 0;"><strong>Date:</strong> ${today}</p>
                    </div>
                    <p>You can view or manage your billing at any time via your <a href="${process.env.APP_URL}/dashboard" style="color: #007bff; text-decoration: none;">Dashboard</a>.</p>
                    <p>Questions? Email <a href="mailto:support@wellnexai.com" style="color: #007bff; text-decoration: none;">support@wellnexai.com</a></p>
                    <p>Thanks for being part of the WellnexAI community!</p>
                </div>
            `
        });

        // Send embed code email
        const embedCode = `&lt;script src="https://wellnexai.com/chatbot.js" data-business-id="${business._id}"&gt;&lt;/script&gt;
        &lt;link rel="stylesheet" href="https://wellnexai.com/chatbot.css"/&gt;`;
        console.log('Sending embed code email with code:', embedCode); // Debug log

        await sendingMail({
            email: business.email,
            sub: "Your WellnexAI chatbot code is ready",
            text: `Hi ${business.name},\n\nYour chatbot is live!\n\nHere's your unique chatbot embed code — copy and paste it into your site:\n\n${embedCode}\n\nWhere to place it: before the closing </body> tag\n\nNeed help? Visit our support portal or reply to this email.\n\nLet's convert more visitors into bookings!\n\n– The WellnexAI Team`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Your WellnexAI chatbot code is ready</h2>
                    <p>Hi ${business.name},</p>
                    <p>Your chatbot is live!</p>
                    <p>Here's your unique chatbot embed code — copy and paste it into your site:</p>
                    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <code style="font-family: monospace; word-break: break-all;">${embedCode}</code>
                    </div>
                    <p><strong>Where to place it:</strong> before the closing &lt;/body&gt; tag</p>
                    <p>Need help? Visit our support portal or reply to this email.</p>
                    <p>Let's convert more visitors into bookings!</p>
                    <p>– The WellnexAI Team</p>
                </div>
            `,
            attachments: [{
                filename: 'How_to_Install.pdf',
                path: path.join(__dirname, '../public/How_to_Install.pdf')
            }]
        });

        console.log("Mail sent successfully in after subscription.");
        return {
            subscriptionId: subscription.id,
            clientSecret: subscription.latest_invoice.payment_intent.client_secret,
            isNewCard: !isDuplicate
        };
    } catch (error) {
        throw new Error(`Error creating subscription: ${error.message}`);
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
            status: { $in: ['active', 'trialing'] },
            isSpecialOffer: false,
        });

        if (!subscription) {
            throw new Error('No active subscription found');
        }

        // Check if user has already received the special offer
        if (!subscription.hasReceivedSpecialOffer) {
            // Update subscription to mark that offer has been presented
            subscription.hasReceivedSpecialOffer = true;
            await subscription.save();

            // Return special offer instead of canceling
            return {
                success: true,
                message: 'We understand that businesses have ups and downs. We\'d like to offer you a special rate of $50 for the next month to help you through this period. Press the button below to apply the offer.',
                hasSpecialOffer: true,
                specialOfferPrice: 50,
                currentPeriodEnd: subscription.currentPeriodEnd
            };
        }

        // If user has already received the offer or declined it, proceed with cancellation
        const stripeSubscription = await stripe.subscriptions.update(
            subscription.stripeSubscriptionId,
            { cancel_at_period_end: true }
        );

        // Update the subscription in our database
        subscription.cancelAtPeriodEnd = true;
        subscription.status = stripeSubscription.status;
        await subscription.save();

        // Get user details for personalized email
        const user = await Business.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Format the end date
        const endDate = subscription.currentPeriodEnd.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        sendingMail({
            email: user.email,
            sub: "Your WellnexAI Subscription Will End in 30 Days",
            text: `Hi ${user.name},\n\nWe've received your cancellation request.\n\nYour subscription will remain active until ${endDate}, after which your dashboard access will be paused.\n\nDon't worry — your data is saved. If you change your mind, you can reactivate at any time.\n\nThank you for trying WellnexAI.\n\nWe truly appreciate having had the chance to support your business and hope to welcome you back in the future.\n\n– The WellnexAI Team`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Your WellnexAI Subscription Will End in 30 Days</h2>
                    <p>Hi ${user.name},</p>
                    <p>We've received your cancellation request.</p>
                    <p>Your subscription will remain active until <strong>${endDate}</strong>, after which your dashboard access will be paused.</p>
                    <p>Don't worry — your data is saved. If you change your mind, you can reactivate at any time.</p>
                    <p>Thank you for trying WellnexAI.</p>
                    <p>We truly appreciate having had the chance to support your business and hope to welcome you back in the future.</p>
                    <p>– The WellnexAI Team</p>
                </div>
            `
        });

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

export const applySpecialOffer = async (userId) => {
    try {
        const subscription = await Subscription.findOne({
            userId,
            status: { $in: ['active', 'trialing'] }
        });

        if (!subscription) {
            throw new Error('No active subscription found');
        }

        if (!subscription.hasReceivedSpecialOffer) {
            throw new Error('No special offer available');
        }

        if (subscription.specialOfferApplied) {
            throw new Error('Special offer already applied');
        }

        // Calculate the next month's date
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getDate() + 1);

        // First, cancel the current subscription
        await stripe.subscriptions.update(
            subscription.stripeSubscriptionId,
            { cancel_at_period_end: true }
        );

        // Create a new product for the special offer
        const newProduct = await stripe.products.create({
            name: 'Special Offer - $50 Monthly',
            description: 'Special one-month offer at $50',
            active: true
        });

        // Create a new price for the special offer
        const newPrice = await stripe.prices.create({
            unit_amount: 5000, // $50.00 in cents
            currency: 'usd',
            product: newProduct.id,
            active: true
        });

        // Create a payment intent for the discounted month
        const paymentIntent = await stripe.paymentIntents.create({
            amount: 5000, // $50.00 in cents
            currency: 'usd',
            customer: subscription.stripeCustomerId,
            setup_future_usage: 'off_session',
            metadata: {
                userId: userId.toString(),
                type: 'special_offer',
                expiryDate: nextMonth.toISOString()
            }
        });

        // Update the current subscription to mark it as canceled
        subscription.status = 'canceled';
        subscription.cancelAtPeriodEnd = true;
        subscription.specialOfferApplied = true;
        subscription.specialOfferPrice = 50;
        subscription.specialOfferExpiry = nextMonth;
        await subscription.save();

        // Create a new subscription record for the special offer period
        const specialOfferSubscription = {
            userId,
            stripeSubscriptionId: `special_${Date.now()}`, // Custom ID for special offer
            stripeCustomerId: subscription.stripeCustomerId,
            paymentMethodId: subscription.paymentMethodId,
            status: 'active',
            priceId: newPrice.id,
            amount: 50,
            currentPeriodStart: new Date(),
            currentPeriodEnd: nextMonth,
            isSpecialOffer: true,
            specialOfferPrice: 50,
            specialOfferExpiry: nextMonth
        };

        await Subscription.create(specialOfferSubscription);

        // Get user details for personalized email
        const user = await Business.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Format dates
        const createdDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const updateDate = nextMonth.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // Send confirmation email
        await sendingMail({
            email: user.email,
            sub: `Your Discounted Month is Confirmed – ${specialOfferSubscription.amount} Applied`,
            text: `Hi ${user.name},\n\nThank you for staying with WellnexAI!\n\nWe've applied your ${specialOfferSubscription.amount} discounted plan for the next month.\n\nCreated: ${createdDate}\nUpdate Date: ${updateDate}\n\nAfter that, your subscription will return to £199/month automatically.\n\nYou can update or cancel your subscription anytime from your Dashboard.\n\n– Thanks for growing with us,\nThe WellnexAI Team`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Your Discounted Month is Confirmed – ${specialOfferSubscription.amount} Applied</h2>
                    <p>Hi ${user.name},</p>
                    <p>Thank you for staying with WellnexAI!</p>
                    <p>We've applied your ${specialOfferSubscription.amount} discounted plan for the next month.</p>
                    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Created:</strong> ${createdDate}</p>
                        <p style="margin: 5px 0;"><strong>Update Date:</strong> ${updateDate}</p>
                    </div>
                    <p>After that, your subscription will return to £199/month automatically.</p>
                    <p>You can update or cancel your subscription anytime from your <a href="${config.APP_URL}/dashboard" style="color: #007bff; text-decoration: none;">Dashboard</a>.</p>
                    <p>– Thanks for growing with us,<br>The WellnexAI Team</p>
                </div>
            `
        });

        return {
            success: true,
            message: 'Special offer has been applied. Your subscription will continue until ' + nextMonth.toLocaleDateString(),
            specialOfferPrice: 50,
            specialOfferExpiry: nextMonth,
            clientSecret: paymentIntent.client_secret,
            requiresAction: paymentIntent.status === 'requires_action'
        };
    } catch (error) {
        console.error('Error applying special offer:', error);
        throw new Error(`Error applying special offer: ${error.message}`);
    }
};

export const getActiveSubscription = async (userId) => {
    try {
        const subscription = await Subscription.findOne({
            userId,
            status: { $in: ['active', 'trialing', 'canceled'] },
            currentPeriodEnd: { $gt: new Date() }
        });
        let existingBusiness = await retriveBusiness({
            _id: userId,
        });
        return { ...subscription._doc, email: existingBusiness.email };
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
        const user = await Business.findById({ _id: userId });
        if (!user) {
            throw new Error('User not found');
        }
        if (!user.stripeCustomerId) {
            return [];
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

export const getSubscriptionPlans = async (userId) => {
    try {
        const business = await Business.findById({ _id: userId }).populate('preferredCurrency');
        if (!business) {
            throw new Error('Business not found');
        }
        // Fetch all active prices with their associated products
        const prices = await stripe.prices.list({
            active: true,
            product: 'prod_SMGEcS5lrtPGbw',
            expand: ['data.product'],
            type: 'recurring'
        });
        console.log(prices.data[0].currency, business.preferredCurrency.code);
        // Format the plans data
        const plans = prices.data
            .filter(price => price.currency.toLowerCase() === business.preferredCurrency.code.toLowerCase())
            .map(price => ({
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

export const getProductPrices = async (productId) => {
    try {
        // Fetch all active prices for the specific product
        const prices = await stripe.prices.list({
            active: true,
            product: productId,
            expand: ['data.product'],
            type: 'recurring'
        });

        // Format the prices data
        const formattedPrices = prices.data.map(price => ({
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

        return formattedPrices;
    } catch (error) {
        throw new Error(`Error fetching product prices: ${error.message}`);
    }
};

export const renewSubscriptionAfterSpecialOffer = async (userId, paymentMethodId) => {
    try {
        // Find the special offer subscription
        const specialOfferSubscription = await Subscription.findOne({
            userId,
            isSpecialOffer: true,
            status: { $in: ['active', 'trialing'] },
            currentPeriodEnd: { $gt: new Date() }
        });

        if (!specialOfferSubscription) {
            throw new Error('No active special offer subscription found');
        }

        // Get the original subscription to get the original price
        const originalSubscription = await Subscription.findOne({
            userId,
            isSpecialOffer: false,
            status: 'canceled'
        }).sort({ createdAt: -1 });

        if (!originalSubscription) {
            throw new Error('No original subscription found');
        }

        // Get price details from Stripe
        const price = await stripe.prices.retrieve(originalSubscription.priceId);
        if (!price) {
            throw new Error('Original price not found');
        }

        // Get payment method details to check for duplicates
        const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

        // Get all saved payment methods for the customer
        const savedPaymentMethods = await stripe.paymentMethods.list({
            customer: specialOfferSubscription.stripeCustomerId,
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
                customer: specialOfferSubscription.stripeCustomerId,
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
        await stripe.customers.update(specialOfferSubscription.stripeCustomerId, {
            invoice_settings: {
                default_payment_method: finalPaymentMethodId,
            },
        });

        // Create new subscription
        const subscription = await stripe.subscriptions.create({
            customer: specialOfferSubscription.stripeCustomerId,
            items: [{ price: originalSubscription.priceId }],
            payment_behavior: 'error_if_incomplete',
            payment_settings: { save_default_payment_method: 'on_subscription' },
            expand: ['latest_invoice.payment_intent'],
        });

        // Update special offer subscription to mark it as ending
        specialOfferSubscription.status = 'canceled';
        await specialOfferSubscription.save();

        // Create new subscription record
        const newSubscription = {
            userId,
            stripeSubscriptionId: subscription.id,
            stripeCustomerId: specialOfferSubscription.stripeCustomerId,
            paymentMethodId: finalPaymentMethodId,
            status: subscription.status,
            priceId: originalSubscription.priceId,
            amount: price.unit_amount / 100,
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            isSpecialOffer: false
        };

        await Subscription.create(newSubscription);

        return {
            success: true,
            message: 'Subscription renewed successfully',
            subscriptionId: subscription.id,
            clientSecret: subscription.latest_invoice.payment_intent.client_secret,
            isNewCard: !isDuplicate
        };
    } catch (error) {
        console.error('Error renewing subscription:', error);
        throw new Error(`Error renewing subscription: ${error.message}`);
    }
};

export const updateCardDetails = async (userId, cardId, cardDetails) => {
    try {
        const user = await Business.findById({ _id: userId });
        if (!user) {
            throw new Error('User not found');
        }

        // Verify the card belongs to the customer
        const paymentMethod = await stripe.paymentMethods.retrieve(cardId);
        if (paymentMethod.customer !== user.stripeCustomerId) {
            throw new Error('Card does not belong to this user');
        }

        // Update the card details
        const updatedCard = await stripe.paymentMethods.update(cardId, {
            card: {
                exp_month: cardDetails.exp_month,
                exp_year: cardDetails.exp_year,
            },
            billing_details: {
                name: cardDetails.name,
                email: cardDetails.email,
                phone: cardDetails.phone,
                address: cardDetails.address
            }
        });

        return {
            success: true,
            message: 'Card details updated successfully',
            card: {
                id: updatedCard.id,
                brand: updatedCard.card.brand,
                last4: updatedCard.card.last4,
                exp_month: updatedCard.card.exp_month,
                exp_year: updatedCard.card.exp_year,
                name: updatedCard.billing_details.name,
                email: updatedCard.billing_details.email,
                phone: updatedCard.billing_details.phone,
                address: updatedCard.billing_details.address
            }
        };
    } catch (error) {
        console.error('Error updating card details:', error);
        throw new Error(`Error updating card details: ${error.message}`);
    }
};

export const getAllActiveSubscriptions = async (filter = {}, sort = {}, limit = 10, offset = 0) => {
    try {
        const query = {
            status: { $in: ['active', 'trialing'] },
            currentPeriodEnd: { $gt: new Date() },
            ...filter
        };

        const subscriptions = await Subscription.find(query)
            .sort(sort)
            .skip(offset)
            .limit(limit)

        const total = await Subscription.countDocuments(query);

        return {
            subscriptions,
            total,
            limit,
            offset
        };
    } catch (error) {
        throw new Error(`Error getting active subscriptions: ${error.message}`);
    }
};

export const getSubscriptionCountsHandler = async () => {
    try {
        const now = new Date();

        // Get active subscriptions (including trialing)
        const activeCount = await Subscription.countDocuments({
            status: { $in: ['active', 'trialing'] },
            currentPeriodEnd: { $gt: now }
        });

        // Get paused subscriptions
        const pausedCount = await Subscription.countDocuments({
            status: 'paused'
        });

        // Get cancelled subscriptions
        const cancelledCount = await Subscription.countDocuments({
            status: 'canceled'
        });

        // Get total subscriptions
        const totalCount = await Subscription.countDocuments();

        return {
            active: activeCount,
            paused: pausedCount,
            cancelled: cancelledCount,
            total: totalCount
        };
    } catch (error) {
        throw new Error(`Error getting subscription counts: ${error.message}`);
    }
};

export const getPaymentListHandler = async (filter = {}, limit = 10, offset = 0) => {
    try {
        // Format filter parameters according to Stripe API requirements
        const stripeFilter = {
            limit: limit,
            expand: ['data.customer', 'data.subscription']
        };

        // Add date range filter if provided
        if (filter.status) {
            stripeFilter.status = filter.status;
        }

        // Get all invoices from Stripe (these include subscription payments)
        const invoices = await stripe.invoices.list(stripeFilter);

        // Format the payment data
        const payments = await Promise.all(invoices.data.map(async (invoice) => {
            // Get customer details
            const customer = invoice.customer;
            const customerDetails = customer ? {
                id: customer.id,
                name: customer.name,
                email: customer.email
            } : null;

            // Get subscription details
            const subscription = invoice.subscription;
            const subscriptionDetails = subscription ? {
                id: subscription.id,
                status: subscription.status,
                currentPeriodEnd: new Date(subscription.current_period_end * 1000),
                currentPeriodStart: new Date(subscription.current_period_start * 1000)
            } : null;

            // Get payment intent details if available
            let paymentIntentDetails = null;
            if (invoice.payment_intent) {
                const paymentIntent = await stripe.paymentIntents.retrieve(invoice.payment_intent);
                paymentIntentDetails = {
                    id: paymentIntent.id,
                    status: paymentIntent.status,
                    paymentMethod: paymentIntent.payment_method ? {
                        type: paymentIntent.payment_method_details?.type,
                        card: paymentIntent.payment_method_details?.card ? {
                            brand: paymentIntent.payment_method_details.card.brand,
                            last4: paymentIntent.payment_method_details.card.last4,
                            expMonth: paymentIntent.payment_method_details.card.exp_month,
                            expYear: paymentIntent.payment_method_details.card.exp_year
                        } : null
                    } : null
                };
            }

            return {
                number: invoice.number,
                amount: invoice.amount_paid / 100, // Convert from cents
                currency: invoice.currency,
                status: invoice.status,
                created: new Date(invoice.created * 1000),
                customer: customerDetails,
                receiptUrl: invoice.hosted_invoice_url,
                invoicePdf: invoice.invoice_pdf,
                billingReason: invoice.billing_reason,
            };
        }));

        return {
            payments,
            limit,
            offset
        };
    } catch (error) {
        throw new Error(`Error getting payment list: ${error.message}`);
    }
};

export const updateSubscriptionStatusHandler = async (subscriptionId, status) => {
    try {
        // Find the subscription in our database
        const subscription = await Subscription.findOne({
            stripeSubscriptionId: subscriptionId
        });

        if (!subscription) {
            throw new Error('Subscription not found');
        }

        // Validate the status
        const validStatuses = ['active', 'canceled', 'paused', 'trialing'];
        if (!validStatuses.includes(status)) {
            throw new Error('Invalid subscription status');
        }

        let stripeSubscription;

        // Update subscription in Stripe based on the new status
        switch (status) {
            case 'active':
                // Resume a paused subscription
                if (subscription.status === 'paused') {
                    stripeSubscription = await stripe.subscriptions.update(subscriptionId, {
                        pause_collection: null
                    });
                } else {
                    throw new Error('Can only activate paused subscriptions');
                }
                break;

            case 'paused':
                // Pause an active subscription
                if (subscription.status === 'active') {
                    stripeSubscription = await stripe.subscriptions.update(subscriptionId, {
                        pause_collection: {
                            behavior: 'mark_uncollectible'
                        }
                    });
                } else {
                    throw new Error('Can only pause active subscriptions');
                }
                break;

            case 'canceled':
                // Cancel the subscription
                stripeSubscription = await stripe.subscriptions.update(subscriptionId, {
                    cancel_at_period_end: true
                });
                break;

            case 'trialing':
                // Start a trial period
                if (subscription.status === 'canceled') {
                    stripeSubscription = await stripe.subscriptions.update(subscriptionId, {
                        trial_end: Math.floor(Date.now() / 1000) + (14 * 24 * 60 * 60), // 14 days trial
                        cancel_at_period_end: false
                    });
                } else {
                    throw new Error('Can only start trial for canceled subscriptions');
                }
                break;
        }

        // Update subscription in our database
        const updatedSubscription = await Subscription.findOneAndUpdate(
            { stripeSubscriptionId: subscriptionId },
            {
                status: stripeSubscription.status,
                currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
                currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
                cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end
            },
            { new: true }
        );

        return {
            id: updatedSubscription._id,
            stripeSubscriptionId: updatedSubscription.stripeSubscriptionId,
            status: updatedSubscription.status,
            currentPeriodStart: updatedSubscription.currentPeriodStart,
            currentPeriodEnd: updatedSubscription.currentPeriodEnd,
            cancelAtPeriodEnd: updatedSubscription.cancelAtPeriodEnd
        };
    } catch (error) {
        throw new Error(`Error updating subscription status: ${error.message}`);
    }
};

// Add a new function to update user's preferred currency
export const updatePreferredCurrency = async (userId, currencyId) => {
    try {
        const user = await Business.findById({ _id: userId });
        if (!user) {
            throw new Error('User not found');
        }

        // Find currency by code
        const currency = await currencyModel.findOne({ _id: currencyId, isActive: true });
        if (!currency) {
            throw new Error('Invalid currency');
        }

        // Update user's preferred currency with the currency document reference
        user.preferredCurrency = currency._id;
        await user.save();

        return {
            success: true,
            message: 'Preferred currency updated successfully',
            currency: {
                id: currency._id,
                code: currency.code,
                name: currency.name,
                symbol: currency.symbol
            }
        };
    } catch (error) {
        throw new Error(`Error updating preferred currency: ${error.message}`);
    }
};

export const getActiveSubscriptionDetails = async (userId) => {
    try {
        // Find active subscription
        const subscription = await Subscription.findOne({
            userId,
            status: { $in: ['active', 'trialing'] },
            currentPeriodEnd: { $gt: new Date() }
        });

        if (!subscription) {
            throw new Error('No active subscription found');
        }

        // Get business details
        // const business = await Business.findById(userId).populate('preferredCurrency');
        // if (!business) {
        //     throw new Error('Business not found');
        // }

        // Get price details from Stripe
        // const price = await stripe.prices.retrieve(subscription.priceId);
        // if (!price) {
        //     throw new Error('Price not found');
        // }

        // // Get subscription details from Stripe
        // const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);

        // // Format the response
        // const subscriptionDetails = {
        //     id: subscription._id,
        //     stripeSubscriptionId: subscription.stripeSubscriptionId,
        //     status: subscription.status,
        //     plan: {
        //         name: price.product.name,
        //         description: price.product.description,
        //         amount: price.unit_amount / 100,
        //         currency: price.currency,
        //         interval: price.recurring.interval
        //     },
        //     currentPeriod: {
        //         start: subscription.currentPeriodStart,
        //         end: subscription.currentPeriodEnd
        //     },
        //     cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        //     paymentMethod: {
        //         id: subscription.paymentMethodId,
        //         // Get payment method details from Stripe
        //         details: await stripe.paymentMethods.retrieve(subscription.paymentMethodId)
        //     },
        //     business: {
        //         id: business._id,
        //         name: business.name,
        //         email: business.email,
        //         preferredCurrency: {
        //             code: business.preferredCurrency.code,
        //             name: business.preferredCurrency.name,
        //             symbol: business.preferredCurrency.symbol
        //         }
        //     },
        //     nextBillingDate: new Date(stripeSubscription.current_period_end * 1000),
        //     createdAt: subscription.createdAt,
        //     updatedAt: subscription.updatedAt
        // };

        return subscription;
    } catch (error) {
        throw new Error(`Error getting subscription details: ${error.message}`);
    }
}; 
