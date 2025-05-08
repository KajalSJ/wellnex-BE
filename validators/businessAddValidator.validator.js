import validator from "../configurations/validation.config.js";
import ConstHelper from "../helpers/message.helper.js";

const { check } = validator,
  {
    VALIDATIONS: {
      ZIPCODE_INVD,
      DOB_INVD,
      TYPE_REQ,
      TYPE_INVD,
      CODE_INVD,
      CODE_INV,
      PASSCODE_INVD,
      PASSCODE_INV,
      AGE_INVD,
      AGE_INV,
      ADDRESS_REQ,
    },
  } = ConstHelper;

const name = check("name")
    .not()
    .isEmpty()
    .withMessage("name is required field")
    .custom((value) => /^[a-zA-Z ]*$/.test(value))
    .withMessage("name must be in alphabets only"),
  code = check("code")
    .not()
    .isEmpty()
    .withMessage(CODE_INVD)
    .isNumeric()
    .withMessage(CODE_INV),
  passcode = check("passcode")
    .not()
    .isEmpty()
    .withMessage(PASSCODE_INVD)
    .isNumeric()
    .withMessage(PASSCODE_INV),
  age = check("age")
    .not()
    .isEmpty()
    .withMessage(AGE_INVD)
    .isNumeric()
    .withMessage(AGE_INV),
  gender = check("gender")
    .not()
    .isEmpty()
    .withMessage("Gender must be number")
    .isIn(["female", "male", "other"])
    .withMessage("Gender must not be empty"),
  timezone = check("timezone")
    .not()
    .isEmpty()
    .withMessage("timezone is required"),
  address = check("address").not().isEmpty().withMessage(ADDRESS_REQ),
  lastscreen = check("lastscreen")
    .not()
    .isEmpty()
    .withMessage("lastscreen is required"),
  bussinessAddValidator = {
    name,
    gender,
    lastscreen,
    timezone,
    age,
    passcode,
    code,
    address,
  };

export default bussinessAddValidator;
