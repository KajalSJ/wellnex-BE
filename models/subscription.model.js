import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'business',
        required: true
    },
    stripeCustomerId: {
        type: String,
        required: true
    },
    stripeSubscriptionId: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: [
            'active',
            'canceled',
            'incomplete',
            'incomplete_expired',
            'past_due',
            'trialing',
            'unpaid',
            'paused',
        ],
        required: true
    },
    priceId: {
        type: String,
        required: true
    },
    currentPeriodStart: {
        type: Date,
        required: true
    },
    currentPeriodEnd: {
        type: Date,
        required: true
    },
    cancelAtPeriodEnd: {
        type: Boolean,
        default: false
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'usd'
    },
    paymentMethodId: {
        type: String,
        required: true
    },
    // Special offer tracking - simplified and improved
    specialOfferStatus: {
        type: String,
        enum: ['none', 'offered', 'applied', 'expired'],
        default: 'none'
    },
    specialOfferDiscountStart: {
        type: Date,
        default: null
    },
    specialOfferDiscountEnd: {
        type: Date,
        default: null
    },
    specialOfferDiscountAppliedAt: {
        type: Date,
        default: null
    },
    specialOfferCouponId: {
        type: String,
        default: null
    },
    specialOfferDiscountPercent: {
        type: Number,
        default: null
    },
    specialOfferDiscountAmount: {
        type: Number,
        default: null
    },
    specialOfferDiscountDescription: {
        type: String,
        default: null
    },
    specialOfferPrice: {
        type: Number,
        default: null
    },
    isSpecialOffer: {
        type: Boolean,
        default: false
    },
    // Track the original subscription for special offer renewals
    originalSubscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subscription',
        default: null
    }
}, {
    timestamps: true
});

// Add indexes for better performance
subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ stripeSubscriptionId: 1 });
subscriptionSchema.index({ specialOfferStatus: 1, specialOfferDiscountEnd: 1 });
subscriptionSchema.index({ currentPeriodEnd: 1 });

const Subscription = mongoose.model('Subscription', subscriptionSchema);

export default Subscription; 