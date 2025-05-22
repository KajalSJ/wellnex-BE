const ConstHelper = {
  APP_NAME: "Wellnex",
  MESSAGES: {
    //DB MSG
    CONNECTION_SUCCESS: "Connection to database established",
    CONNECTION_ERR: "Error with database connection",
    ENV_NOT_FOUND_ERR: "No .env found. Please add .env to app root",
    SERVER_STARTED: "Wellnex server listening on port PORT.",
    JWT_INVD_ERR: "Unable to verify token",
    JWT_EXPIRED_ERR: "Please generate new token. Unable to verify token",
    NO_TOKEN_ERR: "No auth token found in header",
    PASS_TOKEN_INVD_ERR: "Please pass token properly with Bearer <token>",
    VLD_ERR: "Validation Errors Found",
    INV_TOKEN: "Invalid token or token expire. Please login again",
    VLD_ERR: "Validation Errors Found",
    ACCESS_DENIED: "Access denied. You're not allowed to access this api",
  },
  VALIDATIONS: {
    PAGE_UNEMP: "Page must not be empty ",
    LIMIT_UNEMP: "Per page must not be empty",
    SORT_UNEMP: "Sort must not be empty",
    SEARCH_UNEMP: "Search must not be empty",
    STATUS_UNEMP: "Status must not be empty",
    FILTER_UNEMP: "Filter must not be empty",

    EMAIL_REQ: "Email is required field",
    INVD_EMAIL: "Invalid email provided",
    NAME_REQ: "Name is required field",
    // ADDRESS_REQ: "Please provide an address.",
    // SERVICE_REQ: "Service is required field",
    PASSWORD_REQ: "Password is required field",
    PASSWORD_INVD:
      "Minimum eight characters, at least one letter, one number and one special character required",
    ATOKEN_REQ: "Access token is required field",
    NAME_ALPHA: "Name must be in alphabets only",
    PHONE_INV: "Phone number must be number",
    PHONE_INVD: "Phone number must not be empty",
    CODE_INV: "Code must be number",
    CODE_INVD: "Code must not be empty",
    PASSCODE_INV: "Passcode must be number",
    PASSCODE_INVD: "Passcode must not be empty",
    AGE_INV: "Age must be number",
    AGE_INVD: "Age must not be empty",
    ADDRESS_REQ: "Address must not be empty",
  },
  PATHS: {
    PATH_LOGO_IMAGE: "public/uploads/",
    PATH_VIEW: "views",
  },
  URLS: {
    DEV_APP_URL: "http://localhost",
    PROD_APP_URL: "https://wellnexai.com",
  },
  ROUTES: {
    // Core Base Routes
    ROUTE_INDEX: "/",
    ROUTE_ADMIN: "/admin",
    ROUTE_BUSINESSS: "/business",
    ROUTE_STATIC: "/static/image",
    // Endpoints (starting with base routes)
    INDEX_ENDPOINTS: {
      WELCOME: "/welcome",
    },

    ADMIN_ENDPOINTS: {
      SIGN_UP: "/signup",
      SIGN_IN: "/signin",
      GET_BUSINESS_LIST: "/getBusinessList",
      GET_BUSINESS_DETAIL:"/getBusinessDetail/:_id",
    },
    BUSINESS_ENDPOINTS: {
      SIGN_UP: "/signup",
      SIGN_IN: "/signin",
      FORGOT_PASSWORD: "/forgotPassword",
      RESET_PASSWORD: "/resetPassword",
      LOGOUT: "/logout",
      UPLOAD_BUSINESS_LOGO: "/uploadBusinessLogo",
      SET_BUSINESS_THEME_COLOR: "/setBusinessThemeColor",
      ADD_BUSINESS_KEYWORDS: "/addBusinessKeywords",
      SEND_VERIFICATION_EMAIL: "/sendVerificationEmail",
      VERIFY_EMAIL_BY_LINK: "/verifyEmailByLink",
      UPDATE_BUSINESS_DETAIL:"/updateBusinessDetail",
      GET_BUSINESS_DETAIL:"/getBusinessDetail",
      UPDATE_ONE_KEYWORD:"/updateOneKeyword",
      GET_KEYWORDS:"/getKeywords",
      DELETE_KEYWORD:"/deleteKeyword",
      DELETE_ALL_KEYWORDS:"/deleteAllKeywords",
      SETUP_CHATBOT:"/:businessId/setup-chatbot",
    }
  },
};
export default ConstHelper;
