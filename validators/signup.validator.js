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
    .isLength({ min: 2, max: 50 })
    .withMessage("firstName must be between 2 and 50 characters")
    .custom((value) => /^[a-zA-Z ]*$/.test(value))
    .withMessage("firstName must be in alphabets only"),
  lastName = check("lastName")
    .not()
    .isEmpty()
    .withMessage("lastName is required field")
    .isLength({ min: 2, max: 50 })
    .withMessage("lastName must be between 2 and 50 characters")
    .custom((value) => /^[a-zA-Z ]*$/.test(value))
    .withMessage("lastName must be in alphabets only"),
  name = check("name")
    .not()
    .isEmpty()
    .withMessage("name is required field")
    .isLength({ min: 2, max: 100 })
    .withMessage("name must be between 2 and 100 characters"),
  email = check("email")
    .not()
    .isEmpty()
    .withMessage(EMAIL_REQ)
    .trim()
    .isEmail()
    .withMessage(INVD_EMAIL)
    .isLength({ max: 100 })
    .withMessage("email must not exceed 100 characters"),
  password = check("password")
    .not()
    .isEmpty()
    .withMessage(PASSWORD_REQ)
    .isLength({ min: 8, max: 30 })
    .withMessage("password must be between 8 and 30 characters")
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
    .isLength({ min: 10, max: 15 })
    .withMessage("mobile number must be between 10 and 15 digits")
    .isNumeric()
    .withMessage(PHONE_INV),
    
  DOB = check("DOB")
    .not()
    .isEmpty()
    .withMessage(DOB_INVD)
    .isString(),
  zipcode = check("zipcode")
    .not()
    .isEmpty()
    .withMessage(ZIPCODE_INVD)
    .isLength({ min: 5, max: 10 })
    .withMessage("zipcode must be between 5 and 10 digits")
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
