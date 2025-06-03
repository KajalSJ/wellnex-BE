import { Router } from "express";
import adminDomain from "../domains/admin.domain.js";
import ConstHelper from "../helpers/message.helper.js";
import { deleteBusiness, restoreBusiness } from "../services/business.service.js";
import responseHelper from "../helpers/response.helper.js";
import { isAdmin } from "../middlewares/auth.middleware.js";

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
            console.log(req.user, "req.user._id");

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

export default adminRouter;
