import { check, body, query, param, validationResult } from "express-validator";
import ConstHelper from "../helpers/message.helper.js";
import responseHelper from "../helpers/response.helper.js";

const { send400, send403 } = responseHelper,
  {
    MESSAGES: { VLD_ERR },
  } = ConstHelper;

const validationThrowsError = (req) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return errors.array();
    else return [];
  },
  customValidationError = (res, code, data) => {
    switch (code) {
      case 400:
        send400(res, {
          status: false,
          message: VLD_ERR,
          data,
        });
        break;
      case 403:
        send403(res, {
          status: false,
          message: VLD_ERR,
          data,
        });
        break;
      default:
        break;
    }
  },
  validator = {
    check,
    body,
    query,
    param,
    customValidationError,
    validationThrowsError,
  };

export default validator;
