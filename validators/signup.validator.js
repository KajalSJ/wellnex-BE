import validator from "../configurations/validation.config.js";
import ConstHelper from "../helpers/message.helper.js";

const { check } = validator,
  {
    VALIDATIONS: {
      NAME_ALPHA,
      NAME_REQ,
      PASSWORD_REQ,
      PASSWORD_INVD,
      EMAIL_REQ,
      ZIPCODE_INVD,
      DOB_INVD,
      INVD_EMAIL,
      PHONE_INV,
      PHONE_INVD,
      MOBILE_REQ,
      TYPE_REQ,
      TYPE_INVD,
    },
  } = ConstHelper;

const firstName = check("firstName")
    .not()
    .isEmpty()
    .withMessage("firstName is required field")
    .custom((value) => /^[a-zA-Z ]*$/.test(value))
    .withMessage("firstName must be in alphabets only"),
  lastName = check("lastName")
    .not()
    .isEmpty()
    .withMessage("lastName is required field")
    .custom((value) => /^[a-zA-Z ]*$/.test(value))
    .withMessage("lastName must be in alphabets only"),
  name = check("name")
    .not()
    .isEmpty()
    .withMessage("name is required field"),
  email = check("email")
    .not()
    .isEmpty()
    .withMessage(EMAIL_REQ)
    .trim()
    .isEmail()
    .withMessage(INVD_EMAIL),
  password = check("password")
    .not()
    .isEmpty()
    .withMessage(PASSWORD_REQ)
    .custom((value) =>
      /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/.test(
        value
      )
    )
    .withMessage(PASSWORD_INVD),
  mobile = check("mobile")
    .not()
    .isEmpty()
    .withMessage(PHONE_INVD)
    .isNumeric()
    .withMessage(PHONE_INV),
  DOB = check("DOB").not().isEmpty().withMessage(DOB_INVD).isString(),
  zipcode = check("zipcode")
    .not()
    .isEmpty()
    .withMessage(ZIPCODE_INVD)
    .isNumeric()
    .withMessage("invalid zipcode"),
  type = check("type")
    .not()
    .isEmpty()
    .withMessage(TYPE_REQ)
    .isIn(["web", "bubble", "flutter"])
    .withMessage(TYPE_INVD),
  signupValidator = {
    firstName,
    lastName,
    name,
    email,
    password,
    mobile,
    DOB,
    type,
    zipcode,
  };

export default signupValidator;
