import responseHelper from "../helpers/response.helper.js";
import indexHelper from "../helpers/index.helper.js";
import SleepDiary from "../helpers/message.helper.js";
import adminService from "../services/admin.service.js";
import businessService from "../services/business.service.js";

const { send401, send400 } = responseHelper,
  { retriveAdmin } = adminService,
  { retriveBusiness } = businessService,
  { verifyToken: jwtVerify } = indexHelper,
  {
    MESSAGES: { NO_TOKEN_ERR, PASS_TOKEN_INVD_ERR, INV_TOKEN },
  } = SleepDiary;
const verifyToken = async (req, res, next) => {
  try {
    console.log(req.header, "header");

    if (!req.header("authorization")) {
      send401(res, {
        status: false,
        message: NO_TOKEN_ERR,
        data: null,
      });
    } else {
      const token = req.header("authorization").split("Bearer ");
      console.log(token, "token");
      console.log(token[1], "token[1]");
      req.user = jwtVerify(token[1]).sub;
      console.log(req.user);
      let checkBusiness = await retriveBusiness({ _id: req.user._id });
      let checkAdmin = await retriveAdmin({ _id: req.user._id });
      console.log(checkBusiness, checkAdmin, "checkAdmin");
      if (checkAdmin) {
        if (checkAdmin.loginToken == null) {
          send401(res, {
            status: false,
            message: INV_TOKEN,
            data: null,
          });
        } else {
          req.timezone = req.header("timezone");
          // req.timezone = checkAdmin.timezone;
          next();
        }
      } else if (checkBusiness) {
        if (checkBusiness.loginToken == null) {
          send401(res, {
            status: false,
            message: INV_TOKEN,
            data: null,
          });
        } else {
          next();
        }
      } else {
        send400(res, {
          status: false,
          message: "User not found",
          data: null,
        });
      }
    }
  } catch (error) {
    console.log(error);

    send401(res, {
      status: false,
      message: PASS_TOKEN_INVD_ERR,
      data: null,
      error,
    });
  }
},
  verifyAdminToken = async (req, res, next) => {
    try {
      console.log(req.header, "header");

      if (!req.header("authorization")) {
        send401(res, {
          status: false,
          message: NO_TOKEN_ERR,
          data: null,
        });
      } else {
        const token = req.header("authorization").split("Bearer ");
        console.log(token, "token");
        console.log(token[1], "token[1]");
        req.user = jwtVerify(token[1]).sub;
        console.log(req.user);
        let checkAdmin = await retriveAdmin({ _id: req.user._id });
        console.log(checkAdmin, "checkAdmin");
        if (checkAdmin) {
          if (checkAdmin.loginToken == null) {
            send401(res, {
              status: false,
              message: INV_TOKEN,
              data: null,
            });
          } else {
            req.timezone = req.header("timezone");
            // req.timezone = checkAdmin.timezone;
            next();
          }
        } else {
          send400(res, {
            status: false,
            message: "User not found",
            data: null,
          });
        }
      }
    } catch (error) {
      console.log(error);

      send401(res, {
        status: false,
        message: PASS_TOKEN_INVD_ERR,
        data: null,
        error,
      });
    }
  },
  jwtMiddleware = { verifyToken, verifyAdminToken };

export default jwtMiddleware;
