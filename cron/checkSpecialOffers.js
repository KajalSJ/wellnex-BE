import cron from 'node-cron';
import Subscription from '../models/subscription.model.js';
import Business from '../models/business.model.js';
import awsEmailExternal from "../externals/send.email.external.js";
const { sendingMail } = awsEmailExternal;

// Function to check for expiring special offers
const checkExpiringSpecialOffers = async () => {
    try {
        // Get all special offers expiring in the next 30 days
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate());

        const expiringOffers = await Subscription.find({
            isSpecialOffer: true,
            specialOfferExpiry: {
                $gte: today,
                $lte: tomorrow
            }
        });

        // Send notifications for each expiring offer
        for (const offer of expiringOffers) {
            const business = await Business.findById(offer.userId);
            if (!business) {
                continue;
            }

            // Calculate days until expiry
            const daysUntilExpiry = Math.ceil((new Date(offer.specialOfferExpiry) - today) / (1000 * 60 * 60 * 24));

            // Format dates for email
            const expiryDate = new Date(offer.specialOfferExpiry).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            // Send email notification
            await sendingMail({
                email: business.email,
                sub: `Your WellnexAI Special Offer Expires in ${daysUntilExpiry} Days`,
                text: `Hi ${business.name},\n\nYour special offer subscription will expire in ${daysUntilExpiry} days (${expiryDate}).\n\nTo continue enjoying our services, please renew your subscription through your dashboard.\n\nIf you have any questions or need assistance, please don't hesitate to contact our support team.\n\nBest regards,\nThe WellnexAI Team`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #333;">Your WellnexAI Special Offer Expires in ${daysUntilExpiry} Days</h2>
                        <p>Hi ${business.name},</p>
                        <p>Your special offer subscription will expire in ${daysUntilExpiry} days (${expiryDate}).</p>
                        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                            <p style="margin: 5px 0;"><strong>Days Until Expiry:</strong> ${daysUntilExpiry} days</p>
                            <p style="margin: 5px 0;"><strong>Expiry Date:</strong> ${expiryDate}</p>
                            <p style="margin: 5px 0;"><strong>Current Plan:</strong> Special Offer (${offer.specialOfferPrice} ${offer.currency.toUpperCase()})</p>
                        </div>
                        <p>To continue enjoying our services, please renew your subscription through your <a href="https://wellnexai.com/dashboard" style="color: #007bff; text-decoration: none;">dashboard</a>.</p>
                        <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
                        <p>Best regards,<br>The WellnexAI Team</p>
                    </div>
                `
            });
        }
    } catch (error) {
        console.error('Error checking expiring special offers:', error);
    }
};

// Schedule the cron job to run daily at 9:00 AM
const startSpecialOfferCron = () => {
    cron.schedule('0 9 * * *', () => {
        console.log('Running special offer expiry check...');
        checkExpiringSpecialOffers();
    });
};

export default startSpecialOfferCron; 