import { Router } from "express";
import ConstHelper from "../helpers/message.helper.js";
import businessDomain from "../domains/business.domain.js";
import upload from "../middlewares/upload.middleware.js";

const businessRouter = Router(),
  {
    businessSignup,
    businessSignin,
    resetPassword,
    forgotPassword,
    logoutBusiness,
    uploadBusinessLogo,
    setBusinessThemeColor,
    addBusinessKeywords,
    sendVerificationEmail,
    verifyEmailByLink,
    updateBusinessDetail, 
    getBusinessDetail, 
    updateOneKeyWord,
    getKeywords,
    deleteKeyword,
    deleteAllKeywords,
  } = businessDomain,
  {
    ROUTES: {
      BUSINESS_ENDPOINTS: {
        SIGN_UP,
        SIGN_IN,
        RESET_PASSWORD,
        FORGOT_PASSWORD,
        LOGOUT,
        UPLOAD_BUSINESS_LOGO,
        SET_BUSINESS_THEME_COLOR,
        ADD_BUSINESS_KEYWORDS,
        SEND_VERIFICATION_EMAIL,
        VERIFY_EMAIL_BY_LINK,
        UPDATE_BUSINESS_DETAIL,
        GET_BUSINESS_DETAIL,
        UPDATE_ONE_KEYWORD,
        GET_KEYWORDS,
        DELETE_KEYWORD,
        DELETE_ALL_KEYWORDS,
      },
    },
  } = ConstHelper;

businessRouter.post(SIGN_UP, businessSignup);
businessRouter.post(SIGN_IN, businessSignin);
businessRouter.post(RESET_PASSWORD, resetPassword);
businessRouter.post(FORGOT_PASSWORD, forgotPassword);
businessRouter.post(LOGOUT, logoutBusiness);
businessRouter.post(UPLOAD_BUSINESS_LOGO, uploadBusinessLogo);
businessRouter.post(SET_BUSINESS_THEME_COLOR, setBusinessThemeColor);
businessRouter.post(ADD_BUSINESS_KEYWORDS, addBusinessKeywords);
businessRouter.post(SEND_VERIFICATION_EMAIL, sendVerificationEmail);
businessRouter.post(VERIFY_EMAIL_BY_LINK, verifyEmailByLink);
businessRouter.put(UPDATE_BUSINESS_DETAIL, updateBusinessDetail);
businessRouter.get(GET_BUSINESS_DETAIL, getBusinessDetail);
businessRouter.put(UPDATE_ONE_KEYWORD, updateOneKeyWord);
businessRouter.get(GET_KEYWORDS, getKeywords);
businessRouter.delete(DELETE_KEYWORD, deleteKeyword);
businessRouter.delete(DELETE_ALL_KEYWORDS, deleteAllKeywords);


export default businessRouter;
