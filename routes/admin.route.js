import { Router } from "express";
import adminDomain from "../domains/admin.domain.js";
import ConstHelper from "../helpers/message.helper.js";

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

adminRouter.post(SIGN_UP, adminSignup);
adminRouter.post(SIGN_IN, adminSignin);
adminRouter.get(GET_BUSINESS_LIST, getBusinessList);
adminRouter.post(GET_BUSINESS_DETAIL, getBusinessDetail);
adminRouter.get(GET_ACTIVE_SUBSCRIPTIONS, getActiveSubscriptions);
adminRouter.get(GET_SUBSCRIPTION_COUNTS, getSubscriptionCounts);
adminRouter.get(GET_PAYMENT_LIST, getPaymentList);
adminRouter.put(UPDATE_SUBSCRIPTION_STATUS, updateSubscriptionStatus);
export default adminRouter;
