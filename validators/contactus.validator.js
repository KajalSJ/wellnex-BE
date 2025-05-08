import validator from "../configurations/validation.config.js";
import ConstHelper from "../helpers/message.helper.js";

const { check } = validator,
  {
    VALIDATIONS: { EMAIL_REQ, INVD_EMAIL, PHONE_INV, PHONE_INVD },
  } = ConstHelper;

const name = check("name")
    .not()
    .isEmpty()
    .withMessage("name is required field")
    .custom((value) => /^[a-zA-Z ]*$/.test(value))
    .withMessage("name must be in alphabets only"),
  message = check("message")
    .not()
    .isEmpty()
    .withMessage("message is required field"),
  email = check("email")
    .not()
    .isEmpty()
    .withMessage(EMAIL_REQ)
    .trim()
    .isEmail()
    .withMessage(INVD_EMAIL),
  phone = check("phone")
    .not()
    .isEmpty()
    .withMessage(PHONE_INVD)
    .isNumeric()
    .withMessage(PHONE_INV),
  contactusValidator = {
    message,
    name,
    email,
    phone,
  };

export default contactusValidator;
