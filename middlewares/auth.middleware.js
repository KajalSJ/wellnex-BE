import responseHelper from "../helpers/response.helper.js";
import indexHelper from "../helpers/index.helper.js";
import adminService from "../services/admin.service.js";
import SleepDiary from "../helpers/message.helper.js";

const { send401, send400 } = responseHelper,
    { retriveAdmin } = adminService,
    { verifyToken: jwtVerify } = indexHelper,
    {
        MESSAGES: { NO_TOKEN_ERR, PASS_TOKEN_INVD_ERR, INV_TOKEN },
    } = SleepDiary;

export const isAdmin = async (req, res, next) => {
    try {
        if (!req.header("authorization")) {
            return send401(res, {
                status: false,
                message: NO_TOKEN_ERR,
                data: null,
            });
        }

        const token = req.header("authorization").split("Bearer ");
        req.user = jwtVerify(token[1]).sub;

        const admin = await retriveAdmin({ _id: req.user._id });
        
        if (!admin) {
            return send400(res, {
                status: false,
                message: "Access denied. Admin privileges required.",
                data: null,
            });
        }

        if (admin.loginToken === null) {
            return send401(res, {
                status: false,
                message: INV_TOKEN,
                data: null,
            });
        }

        // Check if user has admin role
        if (!admin.roles.includes("admin")) {
            return send400(res, {
                status: false,
                message: "Access denied. Admin privileges required.",
                data: null,
            });
        }

        req.timezone = req.header("timezone");
        next();
    } catch (error) {
        console.error("Admin Auth Error:", error);
        return send401(res, {
            status: false,
            message: PASS_TOKEN_INVD_ERR,
            data: null,
            error,
        });
    }
}; 