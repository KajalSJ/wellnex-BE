import { Router } from "express";
import adminDomain from "../domains/admin.domain.js";
import ConstHelper from "../helpers/message.helper.js";
import { deleteBusiness, restoreBusiness } from "../services/business.service.js";
import responseHelper from "../helpers/response.helper.js";
import { isAdmin } from "../middlewares/auth.middleware.js";
import Lead from "../models/lead.model.js";
import adminService from "../services/admin.service.js";
import { cancelSubscriptionImmediately, pauseSubscription, resumeSubscription } from "../services/subscription.service.js";
import businessModel from "../models/business.model.js";

const adminRouter = Router(),
    {
        adminSignup,
        adminSignin,
        getBusinessList,
        getBusinessDetail,
        getActiveSubscriptions,
        getSubscriptionCounts,
        getPaymentList,
        updateSubscriptionStatus,
    } = adminDomain,
    {
        ROUTES: {
            ADMIN_ENDPOINTS: {
                SIGN_UP,
                SIGN_IN,
                GET_BUSINESS_LIST,
                GET_BUSINESS_DETAIL,
                GET_ACTIVE_SUBSCRIPTIONS,
                GET_SUBSCRIPTION_COUNTS,
                GET_PAYMENT_LIST,
                UPDATE_SUBSCRIPTION_STATUS,
            },
        },
    } = ConstHelper;

const { send200, send400, send401 } = responseHelper;

adminRouter.post(SIGN_UP, adminSignup);
adminRouter.post(SIGN_IN, adminSignin);
adminRouter.get(GET_BUSINESS_LIST, getBusinessList);
adminRouter.post(GET_BUSINESS_DETAIL, getBusinessDetail);
adminRouter.get(GET_ACTIVE_SUBSCRIPTIONS, getActiveSubscriptions);
adminRouter.get(GET_SUBSCRIPTION_COUNTS, getSubscriptionCounts);
adminRouter.get(GET_PAYMENT_LIST, getPaymentList);
adminRouter.put(UPDATE_SUBSCRIPTION_STATUS, updateSubscriptionStatus);

// Delete business by admin
adminRouter.delete('/business/:businessId',
    isAdmin,
    async (req, res) => {
        try {
            const { businessId } = req.params;
            const { reason } = req.body;

            if (!businessId) {
                return send400(res, {
                    status: false,
                    message: "Business ID is required",
                    data: null
                });
            }
            const result = await deleteBusiness(businessId, req.user._id, reason);

            return send200(res, result);
        } catch (error) {
            return send401(res, {
                status: false,
                message: error.message,
                data: null
            });
        }
    });

// Restore deleted business
adminRouter.post('/business/:businessId/restore',
    isAdmin,
    async (req, res) => {
        try {
            const { businessId } = req.params;

            if (!businessId) {
                return send400(res, {
                    status: false,
                    message: "Business ID is required",
                    data: null
                });
            }

            const result = await restoreBusiness(businessId);
            return send200(res, result);
        } catch (error) {
            return send401(res, {
                status: false,
                message: error.message,
                data: null
            });
        }
    });
// Get lead counts
adminRouter.get('/lead-counts', isAdmin, async (req, res) => {
    try {

        // Get total leads count
        const totalLeads = await Lead.countDocuments({});
        const totalBusiness = await businessModel.countDocuments({})
        res.json({
            status: true,
            data: {
                totalLeads,
                totalBusiness,
            }
        });
    } catch (err) {
        console.error("Get Lead Counts Error:", err);
        res.status(500).json({
            status: false,
            message: "Internal server error"
        });
    }
});

// Get admin list
adminRouter.get('/list', isAdmin, async (req, res) => {
    try {
        const filter = {};
        const sort = { createdAt: -1 };
        const select = ['name', 'email', 'roles', 'active', 'inactive', 'loginTime', 'createdAt'];

        const admins = await adminService.retrieveAdmins(filter, sort);

        send200(res, {
            status: true,
            message: "Admin list fetched successfully",
            data: admins
        });
    } catch (err) {
        console.error("Get Admin List Error:", err);
        send401(res, {
            status: false,
            message: err.message || "Failed to fetch admin list",
            data: null
        });
    }
});
adminRouter.post('/subscription/cancel', isAdmin, async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ 
                error: 'User ID is required' 
            });
        }

        const result = await cancelSubscriptionImmediately(userId);
        res.json({
            ...result,
            message: result.message,
            subscriptionType: result.isSpecialOffer ? 'Special Offer' : 'Regular'
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});
adminRouter.post('/subscription/pause', isAdmin, async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ 
                error: 'User ID is required' 
            });
        }

        const result = await pauseSubscription(userId);
        res.json({
            ...result,
            message: result.message,
            subscriptionType: result.isSpecialOffer ? 'Special Offer' : 'Regular'
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});
adminRouter.post('/subscription/resume', isAdmin, async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ 
                error: 'User ID is required' 
            });
        }

        const result = await resumeSubscription(userId);
        res.json({
            ...result,
            message: result.message,
            subscriptionType: result.isSpecialOffer ? 'Special Offer' : 'Regular'
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});
export default adminRouter;
