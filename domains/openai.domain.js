import businessService from "../services/business.service.js";
import responseHelper from "../helpers/response.helper.js";
import Subscription from "../models/subscription.model.js";

const { retriveBusiness } = businessService,
    { send200, send401, send400 } = responseHelper;

export const getChatBotDetail = async (req, res) => {
    const {
        body: { businessId },
    } = req;
    try {
        let existingBusiness = await retriveBusiness({
            _id: businessId,
        });
        if (!existingBusiness) {
            return send400(res, {
                status: false,
                message: "Email not registered",
                data: null,
            });
        } else {
            // check if this business have valid subscription
            // First try to find an active subscription for today
            let subscription = await Subscription.findOne({
                userId: businessId,
                status: { $in: ['active', 'trialing', 'canceled', 'paused'] },
                currentPeriodStart: { $lt: new Date() },
                currentPeriodEnd: { $gte: new Date() }
            }).sort({ createdAt: 1 });

            // Active subscription
            send200(res, {
                status: true,
                message: "Business details fetched successfully",
                data: {
                    name: existingBusiness.name,
                    website_url: existingBusiness.website_url,
                    logo: existingBusiness.logo,
                    themeColor: existingBusiness.themeColor,
                    subscription: subscription?.status === 'active' ? subscription : null,
                },
            });
        }
    } catch (err) {
        send401(res, {
            status: false,
            message: err.message,
            data: null,
        });
    }
}
