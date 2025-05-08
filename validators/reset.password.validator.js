import validator from "../configurations/validation.config.js";
import ConstHelper from "../helpers/message.helper.js";

const { check } = validator,
  {
    VALIDATIONS: { OTP_REQ, OTP_INVD, PASSWORD_REQ, PASSWORD_INVD },
  } = ConstHelper;

const otp = check("otp")
    .not()
    .isEmpty()
    .withMessage(OTP_REQ)
    .isNumeric()
    .withMessage(OTP_INVD),
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
  type = check("type")
    .not()
    .isEmpty()
    .withMessage("type is required")
    .isIn(["complete-profile", "forgot-password"])
    .withMessage(
      "'type is invalid, type must be 'complete-profile' or 'forgot-password'"
    ),
  resetPasswordValidator = {
    otp,
    password,
    type,
  };

export default resetPasswordValidator;
