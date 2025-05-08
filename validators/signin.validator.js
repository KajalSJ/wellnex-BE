import validator from "../configurations/validation.config.js";
import ConstHelper from "../helpers/message.helper.js";

const { check } = validator,
  {
    VALIDATIONS: { EMAIL_REQ, INVD_EMAIL, PASSWORD_REQ },
  } = ConstHelper;

const email = check("email")
    .not()
    .isEmpty()
    .withMessage(EMAIL_REQ)
    .trim()
    .isEmail()
    .withMessage(INVD_EMAIL),
  password = check("password").not().isEmpty().withMessage(PASSWORD_REQ),
  signinValidator = {
    email,
    password,
  };

export default signinValidator;
