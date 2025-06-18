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
    hasReceivedSpecialOffer: {
        type: Boolean,
        default: false
    },
    specialOfferApplied: {
        type: Boolean,
        default: false
    },
    specialOfferPrice: {
        type: Number,
        default: null
    },
    specialOfferExpiry: {
        type: Date,
        default: null
    },
    isSpecialOffer: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

const Subscription = mongoose.model('Subscription', subscriptionSchema);

export default Subscription; 