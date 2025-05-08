import { Router } from "express";
import adminDomain from "../domains/admin.domain.js";
import ConstHelper from "../helpers/message.helper.js";

const adminRouter = Router(),
  {
    adminSignup,
    adminSignin,
    getBusinessList,
    getBusinessDetail,
  } = adminDomain,
  {
    ROUTES: {
      ADMIN_ENDPOINTS: {
        SIGN_UP,
        SIGN_IN,
        GET_BUSINESS_LIST,
        GET_BUSINESS_DETAIL,
      },
    },
  } = ConstHelper;

adminRouter.post(SIGN_UP, adminSignup);
adminRouter.post(SIGN_IN, adminSignin);
adminRouter.get(GET_BUSINESS_LIST, getBusinessList);
adminRouter.get(GET_BUSINESS_DETAIL, getBusinessDetail)

export default adminRouter;
