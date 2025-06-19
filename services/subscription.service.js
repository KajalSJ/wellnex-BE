import Stripe from 'stripe';
import Subscription from '../models/subscription.model.js';
import Business from '../models/business.model.js';
import awsEmailExternal from '../externals/send.email.external.js';
import businessService from './business.service.js';
import currencyModel from '../models/currency.model.js';
import path from 'path';
import __dirname from "../configurations/dir.config.js";
import config from "../configurations/app.config.js";
import adminService from './admin.service.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const { sendingMail } = awsEmailExternal,
    { retriveBusiness } = businessService;
const specialOfferPriceValue = 100;
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
            status: { $in: ['active', 'trialing', 'canceled'] },
            currentPeriodEnd: { $gte: new Date() }
        });
        if (subscriptionActive) {
            return {
                status: false,
                message: "Business already has an active subscription",
                data: subscriptionActive,
            };
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
                name: business.name,
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
                    <p>You can view or manage your billing at any time via your <a href="https://wellnexai.com/dashboard" style="color: #007bff; text-decoration: none;">Dashboard</a>.</p>
                    <p>Questions? Email <a href="mailto:support@wellnexai.com" style="color: #007bff; text-decoration: none;">support@wellnexai.com</a></p>
                    <p>Thanks for being part of the WellnexAI community!</p>
                </div>
            `
        });

        // Send embed code email
        const embedCode = `&lt;script src="https://wellnexai.com/chatbot.js" data-business-id="${business._id}"&gt;&lt;/script&gt;
        &lt;link rel="stylesheet" href="https://wellnexai.com/chatbot.css"/&gt;`;

        sendingMail({
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

export const checkSpecialOfferPrice = async (userId) => {
    // Find the active subscription
    const subscription = await Subscription.findOne({
        userId,
        status: { $in: ['active', 'trialing'] },
        currentPeriodEnd: { $gte: new Date() },
    });

    if (!subscription) {
        throw new Error('No active subscription found');
    }
    if (subscription.isSpecialOffer) {
        return {
            success: true,
            message: 'Special offer already applied.',
            hasSpecialOffer: true,
            isSpecialOffer: subscription.isSpecialOffer,
            specialOfferPrice: subscription.specialOfferPrice,
            currentPeriodEnd: subscription.currentPeriodEnd
        };
    }
    if (subscription.hasReceivedSpecialOffer && subscription.specialOfferApplied) {
        return {
            success: true,
            message: 'Special offer already applied. We are proceeding to cancel the subscription.',
            hasSpecialOffer: false,
            specialOfferPrice: null,
            currentPeriodEnd: subscription.currentPeriodEnd
        };
    }
    // Update subscription to mark that offer has been presented
    subscription.hasReceivedSpecialOffer = true;
    await subscription.save();

    // Return special offer instead of canceling
    return {
        success: true,
        message: `We understand that businesses have ups and downs. We\'d like to offer you a special rate of $${specialOfferPriceValue} for the next month to help you through this period. Press the button below to apply the offer.`,
        hasSpecialOffer: true,
        specialOfferPrice: specialOfferPriceValue,
        currentPeriodEnd: subscription.currentPeriodEnd
    };

};

export const cancelSubscription = async (userId) => {
    try {
        // Find the active subscription
        const subscription = await Subscription.findOne({
            userId,
            $or: [
                { status: { $in: ['active', 'trialing', 'paused'] } },
                { status: 'canceled', currentPeriodEnd: { $gte: new Date() } }
            ],
            isSpecialOffer: false,
        });

        if (!subscription) {
            throw new Error('No active subscription found');
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

        // Send email to admin
        await sendingMail({
            email: 'support@wellnexai.com',
            sub: `Subscription Cancellation Alert - ${user.name}`,
            text: `A user has cancelled their subscription:\n\nUser Details:\nName: ${user.name}\nEmail: ${user.email}\nSubscription End Date: ${endDate}\n\nThis is an automated notification.`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Subscription Cancellation Alert</h2>
                    <p>A user has cancelled their subscription:</p>
                    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>User Name:</strong> ${user.name}</p>
                        <p style="margin: 5px 0;"><strong>User Email:</strong> ${user.email}</p>
                        <p style="margin: 5px 0;"><strong>Subscription End Date:</strong> ${endDate}</p>
                    </div>
                    <p>This is an automated notification.</p>
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
export const cancelSubscriptionImmediately = async (userId) => {
    try {
        const subscription = await Subscription.findOne({
            userId,
            $or: [
                { status: { $in: ['active', 'trialing', 'paused'] } },
                { status: 'canceled', currentPeriodEnd: { $gte: new Date() } }
            ],
        });
        if (!subscription) {
            throw new Error('No subscription found');
        }
        await stripe.subscriptions.cancel(
            subscription.stripeSubscriptionId,
        );
        await Subscription.findOneAndUpdate(
            { stripeSubscriptionId: subscription.stripeSubscriptionId },
            { status: 'canceled' }
        );
        return {
            success: true,
            message: 'Subscription will be canceled immediately',
            cancelAtPeriodEnd: false,
        };
    } catch (error) {
        console.error('Error canceling subscription:', error);
        throw new Error(`Error canceling subscription: ${error.message}`);
    }
};
export const pauseSubscription = async (userId) => {
    try {
        const subscription = await Subscription.findOne({
            userId,
            $or: [
                { status: { $in: ['active', 'trialing'] } },
                { status: 'canceled', currentPeriodEnd: { $gte: new Date() } }
            ],
            isSpecialOffer: false,
        });
        if (!subscription) {
            throw new Error('No subscription found');
        }
        await stripe.subscriptions.update(
            subscription.stripeSubscriptionId,
            { pause_collection: { behavior: 'mark_uncollectible' } }
        );
        await Subscription.findOneAndUpdate(
            { stripeSubscriptionId: subscription.stripeSubscriptionId },
            { status: 'paused' }
        );
        return {
            success: true,
            message: 'Subscription will be paused',
            pauseCollection: { behavior: 'mark_uncollectible' },
        };
    } catch (error) {
        console.error('Error pausing subscription:', error);
        throw new Error(`Error pausing subscription: ${error.message}`);
    }
};
export const resumeSubscription = async (userId) => {
    try {
        const subscription = await Subscription.findOne({
            userId,
            status: { $in: ['canceled', 'paused'] },
            isSpecialOffer: false,
        });
        if (!subscription) {
            throw new Error('No subscription found');
        }
        await stripe.subscriptions.update(
            subscription.stripeSubscriptionId,
            { pause_collection: null }
        );
        await Subscription.findOneAndUpdate(
            { stripeSubscriptionId: subscription.stripeSubscriptionId },
            { status: 'active' }
        );
        return {
            success: true,
            message: 'Subscription will be resumed',
            pauseCollection: null,
        };
    } catch (error) {
        console.error('Error resuming subscription:', error);
        throw new Error(`Error resuming subscription: ${error.message}`);
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
        nextMonth.setMonth(nextMonth.getMonth() + 1);

        // First, cancel the current subscription
        const stripeSubscription = await stripe.subscriptions.update(
            subscription.stripeSubscriptionId,
            { cancel_at_period_end: true }
        );

        // Create a new product for the special offer
        const newProduct = await stripe.products.create({
            name: `Special Offer - $${specialOfferPriceValue} Monthly`,
            description: `Special one-month offer at $${specialOfferPriceValue}`,
            active: true
        });

        // Create a new price for the special offer
        const newPrice = await stripe.prices.create({
            unit_amount: specialOfferPriceValue * 100, // amount in cents
            currency: 'usd',
            product: newProduct.id,
            active: true
        });

        // Get payment method details to check for duplicates
        const paymentMethod = await stripe.paymentMethods.retrieve(subscription.paymentMethodId);
        // Verify payment method belongs to the customer
        if (paymentMethod.customer !== subscription.stripeCustomerId) {
            throw new Error('Payment method does not belong to this customer');
        }

        // Instead of checking status, let's try to use the payment method directly
        try {
            // Create a payment intent for the discounted month
            const paymentIntent = await stripe.paymentIntents.create({
                amount: specialOfferPriceValue * 100, // amount in cents
                currency: 'usd',
                customer: subscription.stripeCustomerId,
                payment_method: paymentMethod.id,
                confirm: true,
                off_session: true,
                metadata: {
                    userId: userId.toString(),
                    type: 'special_offer',
                    expiryDate: nextMonth.toISOString()
                }
            });

            // Verify payment was successful
            if (paymentIntent.status !== 'succeeded') {
                throw new Error(`Payment failed with status: ${paymentIntent.status}`);
            }

            // Update the current subscription to mark it as canceled
            subscription.status = stripeSubscription.status;
            subscription.cancelAtPeriodEnd = true;
            // subscription.specialOfferApplied = true;
            // subscription.specialOfferPrice = specialOfferPriceValue;
            // subscription.specialOfferExpiry = nextMonth;
            await subscription.save();

            // Calculate start and end dates for special offer
            const specialOfferStartDate = new Date(subscription.currentPeriodEnd);
            const specialOfferEndDate = new Date(specialOfferStartDate);
            specialOfferEndDate.setMonth(specialOfferEndDate.getMonth() + 1);

            // Create a new subscription record for the special offer period
            const specialOfferSubscription = {
                userId,
                stripeSubscriptionId: `special_${Date.now()}`, // Custom ID for special offer
                stripeCustomerId: subscription.stripeCustomerId,
                paymentMethodId: subscription.paymentMethodId,
                status: 'active',
                priceId: newPrice.id,
                amount: specialOfferPriceValue,
                currentPeriodStart: specialOfferStartDate,
                currentPeriodEnd: specialOfferEndDate,
                isSpecialOffer: true,
                specialOfferPrice: specialOfferPriceValue,
                specialOfferExpiry: specialOfferEndDate
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
                text: `Hi ${user.name},\n\nThank you for staying with WellnexAI!\n\nWe've applied your ${specialOfferSubscription.amount} discounted plan for the next month.\n\nCreated: ${createdDate}\n\nAfter that, your subscription will return to £199/month automatically.\n\nYou can update or cancel your subscription anytime from your Dashboard.\n\n– Thanks for growing with us,\nThe WellnexAI Team`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #333;">Your Discounted Month is Confirmed – ${specialOfferSubscription.amount} Applied</h2>
                        <p>Hi ${user.name},</p>
                        <p>Thank you for staying with WellnexAI!</p>
                        <p>We've applied your ${specialOfferSubscription.amount} discounted plan for the next month.</p>
                        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                            <p style="margin: 5px 0;"><strong>Created:</strong> ${createdDate}</p>
                            <p style="margin: 5px 0;"><strong>Start Date:</strong> ${specialOfferSubscription.currentPeriodStart}</p>
                            <p style="margin: 5px 0;"><strong>End Date:</strong> ${specialOfferSubscription.currentPeriodEnd}</p>
                         </div> 
                        <p>To continue enjoying our services, please renew your subscription after the offer expires through your <a href="https://wellnexai.com/dashboard" style="color: #007bff; text-decoration: none;">dashboard</a>.</p>
                        <p>– Thanks for growing with us,<br>The WellnexAI Team</p>
                    </div>
                `
            });

            return {
                success: true,
                message: 'Special offer has been applied. Your subscription will continue until ' + nextMonth.toLocaleDateString(),
                specialOfferPrice: specialOfferPriceValue,
                specialOfferExpiry: specialOfferEndDate,
                clientSecret: paymentIntent.client_secret,
                requiresAction: paymentIntent.status === 'requires_action'
            };
        } catch (error) {
            console.error('Error applying special offer:', error);
            throw new Error(`Error applying special offer: ${error.message}`);
        }
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
            currentPeriodEnd: { $gte: new Date() }
        });
        let existingBusiness = await retriveBusiness({
            _id: userId,
        });
        if (!existingBusiness) {
            throw new Error('Business not found');
        }
        if (subscription) {
            return { ...subscription._doc, email: existingBusiness.email };
        } else {
            const subscriptionPaused = await Subscription.findOne({
                userId,
                status: { $in: ['paused'] },
            });
            if (subscriptionPaused) {
                return {
                    status: false,
                    message: "Your subscription is paused. Please contact admin.",
                    data: null,
                };
            }
            return {
                status: false,
                message: "No active subscription found",
                data: null,
            };
        }
    } catch (error) {
        throw new Error(`Error getting subscription: ${error.message}`);
    }
};

export const handleWebhookEvent = async (event) => {
    try {
        console.log(`Processing webhook event: ${event.type}`);

        switch (event.type) {
            case 'customer.subscription.created':
                const subscriptionCreated = event.data.object;
                await Subscription.findOneAndUpdate(
                    { stripeSubscriptionId: subscriptionCreated.id },
                    {
                        status: subscriptionCreated.status,
                        currentPeriodStart: new Date(subscriptionCreated.current_period_start * 1000),
                        currentPeriodEnd: new Date(subscriptionCreated.current_period_end * 1000),
                        cancelAtPeriodEnd: subscriptionCreated.cancel_at_period_end,
                        priceId: subscriptionCreated.items.data[0].price.id
                    },
                    { upsert: true, new: true }
                );
                console.log(`Subscription created: ${subscriptionCreated.id}`);
                break;

            case 'customer.subscription.updated':
                const subscriptionUpdated = event.data.object;
                if (subscriptionUpdated.pause_collection) {
                    // mark user paused
                    await Subscription.findOneAndUpdate(
                        { stripeSubscriptionId: subscriptionUpdated.id },
                        {
                            status: 'paused',
                            currentPeriodStart: new Date(subscriptionUpdated.current_period_start * 1000),
                            currentPeriodEnd: new Date(subscriptionUpdated.current_period_end * 1000),
                            cancelAtPeriodEnd: subscriptionUpdated.cancel_at_period_end
                        }
                    );
                } else {
                    // mark user active
                    await Subscription.findOneAndUpdate(
                        { stripeSubscriptionId: subscriptionUpdated.id },
                        {
                            status: subscriptionUpdated.status,
                            currentPeriodStart: new Date(subscriptionUpdated.current_period_start * 1000),
                            currentPeriodEnd: new Date(subscriptionUpdated.current_period_end * 1000),
                            cancelAtPeriodEnd: subscriptionUpdated.cancel_at_period_end
                        }
                    );
                }
                console.log(`Subscription updated: ${subscriptionUpdated.id}`);
                break;

            case 'customer.subscription.deleted':
                const subscription = event.data.object;
                await Subscription.findOneAndUpdate(
                    { stripeSubscriptionId: subscription.id },
                    {
                        status: 'canceled',
                        currentPeriodStart: new Date(subscription.current_period_start * 1000),
                        currentPeriodEnd: new Date(), // Set to current time when deleted
                        cancelAtPeriodEnd: subscription.cancel_at_period_end
                    }
                );
                console.log(`Subscription deleted: ${subscription.id}`);
                break;

            case 'invoice.payment_succeeded':
                const invoiceSucceeded = event.data.object;
                if (invoiceSucceeded.subscription) {
                    await Subscription.findOneAndUpdate(
                        { stripeSubscriptionId: invoiceSucceeded.subscription },
                        {
                            status: 'active',
                            lastPaymentDate: new Date()
                        }
                    );
                }
                console.log(`Payment succeeded for invoice: ${invoiceSucceeded.id}`);
                break;

            case 'invoice.payment_failed':
                const invoiceFailed = event.data.object;
                if (invoiceFailed.subscription) {
                    await Subscription.findOneAndUpdate(
                        { stripeSubscriptionId: invoiceFailed.subscription },
                        {
                            status: 'past_due',
                            lastPaymentDate: new Date()
                        }
                    );
                }
                console.log(`Payment failed for invoice: ${invoiceFailed.id}`);
                break;

            case 'customer.subscription.trial_will_end':
                const trialEnding = event.data.object;
                console.log(`Trial ending for subscription: ${trialEnding.id}`);
                // You can add email notification logic here
                break;

            case 'customer.subscription.paused':
                const subscriptionPaused = event.data.object;
                await Subscription.findOneAndUpdate(
                    { stripeSubscriptionId: subscriptionPaused.id },
                    { status: 'paused' }
                );
                console.log(`Subscription paused: ${subscriptionPaused.id}`);
                break;

            case 'customer.subscription.resumed':
                const subscriptionResumed = event.data.object;
                await Subscription.findOneAndUpdate(
                    { stripeSubscriptionId: subscriptionResumed.id },
                    { status: 'active' }
                );
                console.log(`Subscription resumed: ${subscriptionResumed.id}`);
                break;

            default:
                console.log(`Unhandled event type: ${event.type}`);
        }
    } catch (error) {
        console.error('Error handling webhook:', error);
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
        const business = await Business.findById({ _id: userId }).populate('preferredCurrency');
        if (!business) {
            throw new Error('Business not found');
        }

        const specialOfferSubscription = await Subscription.findOne({
            userId,
            isSpecialOffer: true,
            $or: [
                { specialOfferExpiry: { $lte: new Date() } }, // Expiring or expired special offer
                { currentPeriodEnd: { $lte: new Date() } }    // Expiring or expired subscription
            ]
        });

        // Get the original subscription to get the original price
        const originalSubscription = await Subscription.findOne({
            userId,
            isSpecialOffer: false,
            $or: [
                { status: 'canceled' },
                {
                    status: 'active',
                    $or: [
                        { currentPeriodEnd: { $lte: new Date() } }, // Expiring or expired
                        { cancelAtPeriodEnd: true } // Scheduled to cancel
                    ]
                }
            ]
        }).sort({ createdAt: -1 });

        if (!originalSubscription && !specialOfferSubscription) {
            throw new Error('No eligible subscription found for renewal');
        }

        // Get the price from Stripe to verify currency
        const price = await stripe.prices.retrieve(originalSubscription.priceId);

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
                name: business.name,
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
            items: [{ price: originalSubscription.priceId }],
            payment_behavior: 'error_if_incomplete',
            payment_settings: {
                save_default_payment_method: 'on_subscription',
                payment_method_types: ['card'],
            },
            expand: ['latest_invoice.payment_intent'],
            collection_method: 'charge_automatically',
            default_payment_method: finalPaymentMethodId
        });

        // Get the latest invoice
        const latestInvoice = await stripe.invoices.retrieve(subscription.latest_invoice.id, {
            expand: ['payment_intent']
        });

        // Handle payment intent
        let clientSecret;
        if (!latestInvoice.payment_intent || latestInvoice.payment_intent.status === 'succeeded') {
            // Create a new payment intent if none exists or if the existing one is already succeeded
            const paymentIntent = await stripe.paymentIntents.create({
                amount: price.unit_amount,
                currency: price.currency,
                customer: customer.id,
                payment_method: finalPaymentMethodId,
                off_session: true,
                confirm: true,
                metadata: {
                    subscriptionId: subscription.id,
                    userId: userId.toString()
                }
            });
            clientSecret = paymentIntent.client_secret;
        } else {
            // Use the existing payment intent's client secret
            clientSecret = latestInvoice.payment_intent.client_secret;
        }

        // Save subscription details to database
        const subscriptionData = {
            userId,
            stripeSubscriptionId: subscription.id,
            stripeCustomerId: business.stripeCustomerId,
            paymentMethodId: finalPaymentMethodId,
            status: subscription.status,
            priceId: originalSubscription.priceId,
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
            sub: "Your WellnexAI Subscription Has Been Renewed",
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
                    <p>You can view or manage your billing at any time via your <a href="https://wellnexai.com/dashboard" style="color: #007bff; text-decoration: none;">Dashboard</a>.</p>
                    <p>Questions? Email <a href="mailto:support@wellnexai.com" style="color: #007bff; text-decoration: none;">support@wellnexai.com</a></p>
                    <p>Thanks for being part of the WellnexAI community!</p>
                </div>
            `
        });

        return {
            subscriptionId: subscription.id,
            clientSecret: clientSecret,
            isNewCard: !isDuplicate
        };
    } catch (error) {
        console.error('Error in renewSubscriptionAfterSpecialOffer:', error);
        throw new Error(`Failed to renew subscription: ${error.message}`);
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
            status: { $in: ['active', 'trialing', 'canceled'] },
            currentPeriodEnd: { $gte: new Date() },
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
            currentPeriodEnd: { $gte: now },
            currentPeriodStart: { $lte: now },
            cancelAtPeriodEnd: false,
        });

        // Get paused subscriptions
        const pausedCount = await Subscription.countDocuments({
            status: 'paused'
        });

        const cancelAtPeriodEndCount = await Subscription.countDocuments({
            status: { $in: ['active', 'trialing'] },
            currentPeriodEnd: { $gte: now },
            cancelAtPeriodEnd: true,
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
            cancelAtPeriodEndCount, cancelAtPeriodEndCount,
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
        };
    } catch (error) {
        throw new Error(`Error getting payment list: ${error.message}`);
    }
};

export const updateSubscriptionStatusHandler = async (subscriptionId, status) => {
    try {
        console.log(subscriptionId, "subscriptionIda", status);
        // Find the subscription in our database
        const subscription = await Subscription.findOne({
            stripeSubscriptionId: subscriptionId
        });

        if (!subscription) {
            throw new Error('Subscription not found');
        }

        // Validate the status against our schema's allowed values
        const validStatuses = [
            'active',
            'canceled',
            'incomplete',
            'incomplete_expired',
            'past_due',
            'trialing',
            'unpaid',
            'paused',
            'canceledImmediately'
        ];

        if (!validStatuses.includes(status)) {
            throw new Error(`Invalid subscription status. Must be one of: ${validStatuses.join(', ')}`);
        }

        // Check if this is a special offer subscription
        const isSpecialOffer = subscriptionId.startsWith('special_');

        if (isSpecialOffer) {
            // For special offer subscriptions, only update the database
            const updatedSubscription = await Subscription.findOneAndUpdate(
                { stripeSubscriptionId: subscriptionId },
                {
                    status: status === 'canceledImmediately' ? 'canceled' : status,
                    // For canceled status, set currentPeriodEnd to now
                    currentPeriodEnd: status === 'canceled' ? new Date() : subscription.currentPeriodEnd,
                    cancelAtPeriodEnd: status === 'canceled'
                },
                { new: true, runValidators: true }
            );

            if (!updatedSubscription) {
                throw new Error('Failed to update special offer subscription in database');
            }

            return {
                id: updatedSubscription._id,
                stripeSubscriptionId: updatedSubscription.stripeSubscriptionId,
                status: updatedSubscription.status,
                currentPeriodStart: updatedSubscription.currentPeriodStart,
                currentPeriodEnd: updatedSubscription.currentPeriodEnd,
                cancelAtPeriodEnd: updatedSubscription.cancelAtPeriodEnd
            };
        }
        console.log(subscription, "subscription", status);

        let stripeSubscription;

        // Update subscription in Stripe based on the new status
        switch (status) {
            case 'active':
                // Resume a paused subscription
                if (subscription.status === 'paused') {
                    stripeSubscription = await stripe.subscriptions.update(subscriptionId, {
                        cancel_at_period_end: false,
                        pause_collection: null
                    });
                } else if (subscription.status === 'active') {
                    // Step 1: Unset cancel at period end if already set
                    if (subscription.cancelAtPeriodEnd) {
                        stripeSubscription = await stripe.subscriptions.update(subscriptionId, {
                            cancel_at_period_end: false,
                            pause_collection: null,
                        });
                    }
                } else {
                    throw new Error('Can only activate paused subscriptions');
                }
                break;

            case 'paused':
                // Pause an active subscription
                if (subscription.status === 'active') {
                    // Step 1: Unset cancel at period end if already set
                    if (subscription.cancelAtPeriodEnd) {
                        await stripe.subscriptions.update(subscriptionId, {
                            cancel_at_period_end: false,
                        });
                    }

                    // Step 2: Pause the subscription
                    stripeSubscription = await stripe.subscriptions.update(subscriptionId, {
                        pause_collection: {
                            behavior: 'mark_uncollectible',
                        },
                    });

                } else {
                    throw new Error('Can only pause active subscriptions');
                }
                break;

            case 'canceled':
                // Cancel the subscription at period end
                stripeSubscription = await stripe.subscriptions.update(subscriptionId, {
                    cancel_at_period_end: true,
                    pause_collection: null
                });
                break;

            case 'canceledImmediately':
                // Cancel the subscription immediately
                await stripe.subscriptions.update(subscriptionId, {
                    cancel_at_period_end: false,
                    pause_collection: null
                });
                stripeSubscription = await stripe.subscriptions.cancel(subscriptionId);
                break;

            default:
                throw new Error(`Unsupported status transition from ${subscription.status} to ${status}`);
        }

        // Determine the actual status based on pause_collection and other factors
        let actualStatus = stripeSubscription.status;

        if (stripeSubscription.pause_collection && stripeSubscription.pause_collection.behavior === 'mark_uncollectible') {
            actualStatus = 'paused';
        }
        console.log(actualStatus, "actualStatus", stripeSubscription);

        // Update subscription in our database with all relevant fields
        const updatedSubscription = await Subscription.findOneAndUpdate(
            { stripeSubscriptionId: subscriptionId },
            {
                status: actualStatus,
                currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
                currentPeriodEnd: actualStatus === 'canceled' ? new Date() : new Date(stripeSubscription.current_period_end * 1000),
                cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end
            },
            { new: true, runValidators: true }
        );

        if (!updatedSubscription) {
            throw new Error('Failed to update subscription in database');
        }

        return {
            id: updatedSubscription._id,
            stripeSubscriptionId: updatedSubscription.stripeSubscriptionId,
            status: updatedSubscription.status,
            currentPeriodStart: updatedSubscription.currentPeriodStart,
            currentPeriodEnd: updatedSubscription.currentPeriodEnd,
            cancelAtPeriodEnd: updatedSubscription.cancelAtPeriodEnd
        };
    } catch (error) {
        // Log the error for debugging
        console.error('Subscription status update error:', error);

        // Throw a more specific error message
        if (error.type === 'StripeInvalidRequestError') {
            throw new Error(`Stripe API error: ${error.message}`);
        }
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
        const subscription = await Subscription.find({
            userId,
            $or: [
                { specialOfferExpiry: { $gt: new Date() } },
                {
                    $and: [
                        { currentPeriodStart: { $lt: new Date() } },
                        { currentPeriodEnd: { $gte: new Date() } }
                    ]
                }
            ]
        }).sort({ createdAt: -1 });
        console.log(subscription.find(s => s.userId === userId), "subscription");
        if (!subscription || subscription.length === 0) {
            throw new Error('No active subscription found');
        }

        return subscription[0];
    } catch (error) {
        throw new Error(`Error getting subscription details: ${error.message}`);
    }
};

export const getLatestSubscriptionStatusCounts = async () => {
    try {
        // Get all unique users
        const users = await Subscription.distinct('userId');

        // Initialize counts
        const counts = {
            active: 0,
            paused: 0,
            cancelled: 0,
            cancelAtPeriodEndCount: 0,
            total: users.length
        };

        // For each user, get their latest subscription
        for (const userId of users) {
            // First try to find an active subscription for today
            let latestSubscription = await Subscription.findOne({
                userId,
                $or: [
                    {
                        $and: [
                            { status: { $in: ['active', 'trialing', 'paused'] } },
                            { currentPeriodEnd: { $gte: new Date() } },
                        ]
                    },
                    { status: { $in: ['canceled'] } }
                ],
                currentPeriodStart: { $lt: new Date() },
            }).sort({ createdAt: 1 });

            // If no active subscription found, look for a valid special offer
            if (!latestSubscription) {
                latestSubscription = await Subscription.findOne({
                    userId,
                    status: { $in: ['active', 'trialing', 'canceled', 'paused'] },
                    specialOfferExpiry: { $gt: new Date() }
                }).sort({ createdAt: 1 });
            }

            console.log(latestSubscription.status, "latestSubscription", latestSubscription.userId, latestSubscription.currentPeriodEnd, latestSubscription.currentPeriodStart);
            if (latestSubscription) {
                switch (latestSubscription.status) {
                    case 'active':
                        if (latestSubscription.cancelAtPeriodEnd) {
                            counts.cancelAtPeriodEndCount++;
                        } else {
                            counts.active++;
                        }
                        break;
                    case 'paused':
                        counts.paused++;
                        break;
                    case 'canceled':
                        counts.cancelled++;
                        break;
                }
            }
        }
        console.log(counts, "counts");
        return counts;
    } catch (error) {
        console.error('Error getting subscription status counts:', error);
        throw new Error(`Failed to get subscription status counts: ${error.message}`);
    }
};

export const changeSubscriptionCard = async (userId, newPaymentMethodId) => {
    try {
        // Find the active subscription
        const subscription = await Subscription.findOne({
            userId,
            status: { $in: ['active', 'trialing'] },
            currentPeriodEnd: { $gte: new Date() }
        });

        if (!subscription) {
            throw new Error('No active subscription found');
        }

        const business = await Business.findById({ _id: userId });
        if (!business) {
            throw new Error('Business not found');
        }

        if (!business.stripeCustomerId) {
            throw new Error('No Stripe customer found');
        }

        // Get payment method details to check for duplicates
        const paymentMethod = await stripe.paymentMethods.retrieve(newPaymentMethodId);
        let finalPaymentMethodId = newPaymentMethodId;
        let isDuplicate = false;

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
            await stripe.paymentMethods.attach(newPaymentMethodId, {
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

        // Update the subscription's default payment method
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
            default_payment_method: finalPaymentMethodId,
        });

        // Update the subscription record in our database
        subscription.paymentMethodId = finalPaymentMethodId;
        await subscription.save();

        // Send confirmation email
        const today = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        await sendingMail({
            email: business.email,
            sub: "Your WellnexAI Payment Method Has Been Updated",
            text: `Hi ${business.name},\n\nYour payment method for your WellnexAI subscription has been successfully updated.\n\nDate: ${today}\n\nYour next payment will be processed using your new payment method.\n\nYou can view or manage your billing at any time via your Dashboard.\n\nQuestions? Email support@wellnexai.com\n\nThanks for being part of the WellnexAI community!`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Your WellnexAI Payment Method Has Been Updated</h2>
                    <p>Hi ${business.name},</p>
                    <p>Your payment method for your WellnexAI subscription has been successfully updated.</p>
                    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Date:</strong> ${today}</p>
                        <p style="margin: 5px 0;"><strong>Card:</strong> ${paymentMethod.card.brand.toUpperCase()} ending in ${paymentMethod.card.last4}</p>
                    </div>
                    <p>Your next payment will be processed using your new payment method.</p>
                    <p>You can view or manage your billing at any time via your <a href="https://wellnexai.com/dashboard" style="color: #007bff; text-decoration: none;">Dashboard</a>.</p>
                    <p>Questions? Email <a href="mailto:support@wellnexai.com" style="color: #007bff; text-decoration: none;">support@wellnexai.com</a></p>
                    <p>Thanks for being part of the WellnexAI community!</p>
                </div>
            `
        });

        return {
            success: true,
            message: 'Payment method updated successfully. Future payments will be charged to your new card.',
            isNewCard: !isDuplicate,
            cardDetails: {
                brand: paymentMethod.card.brand,
                last4: paymentMethod.card.last4,
                exp_month: paymentMethod.card.exp_month,
                exp_year: paymentMethod.card.exp_year
            }
        };
    } catch (error) {
        console.error('Error changing subscription card:', error);
        throw new Error(`Error changing subscription card: ${error.message}`);
    }
};
