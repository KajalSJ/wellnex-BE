import { Router } from "express";
import ConstHelper from "../helpers/message.helper.js";
import businessDomain from "../domains/business.domain.js";

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
    checkEmailVerified,
    updateBusinessDetail,
    getBusinessDetail,
    updateOneKeyWord,
    updateOneService,
    getKeywords,
    getServicesList,
    deleteKeyword,
    deleteAllKeywords,
    addBusinessQuestions,
    getQuestions,
    updateOneQuestion,
    deleteQuestion,
    deleteAllQuestions,
    setupChatbot,
    getBusinessEmail,
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
        CHECK_EMAIL_VERIFIED,
        UPDATE_BUSINESS_DETAIL,
        GET_BUSINESS_DETAIL,
        UPDATE_ONE_KEYWORD,
        UPDATE_ONE_SERVICE,
        GET_SERVICES_LIST,
        GET_KEYWORDS,
        DELETE_KEYWORD,
        DELETE_ALL_KEYWORDS,
        ADD_BUSINESS_QUESTIONS,
        GET_QUESTIONS,
        UPDATE_ONE_QUESTION,
        DELETE_QUESTION,
        DELETE_ALL_QUESTIONS,
        SETUP_CHATBOT,
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
businessRouter.get(CHECK_EMAIL_VERIFIED, checkEmailVerified);
businessRouter.put(UPDATE_BUSINESS_DETAIL, updateBusinessDetail);
businessRouter.post(GET_BUSINESS_DETAIL, getBusinessDetail);
businessRouter.put(UPDATE_ONE_KEYWORD, updateOneKeyWord);
businessRouter.put(UPDATE_ONE_SERVICE, updateOneService);
businessRouter.post(GET_KEYWORDS, getKeywords);
businessRouter.post(GET_SERVICES_LIST, getServicesList);
businessRouter.delete(DELETE_KEYWORD, deleteKeyword);
businessRouter.delete(DELETE_ALL_KEYWORDS, deleteAllKeywords);
businessRouter.post(ADD_BUSINESS_QUESTIONS, addBusinessQuestions);
businessRouter.post(GET_QUESTIONS, getQuestions);
businessRouter.put(UPDATE_ONE_QUESTION, updateOneQuestion);
businessRouter.delete(DELETE_QUESTION, deleteQuestion);
businessRouter.delete(DELETE_ALL_QUESTIONS, deleteAllQuestions);
businessRouter.post(SETUP_CHATBOT, setupChatbot);
businessRouter.post("/get-business-email", getBusinessEmail);

export default businessRouter;
