import validator from "../configurations/validation.config.js";
import ConstHelper from "../helpers/message.helper.js";

const { query } = validator,
  {
    VALIDATIONS: {
      PAGE_UNEMP,
      LIMIT_UNEMP,
      SORT_UNEMP,
      SEARCH_UNEMP,
      FILTER_UNEMP,
      STATUS_UNEMP,
    },
  } = ConstHelper;

const page = query("page").optional().not().isEmpty().withMessage(PAGE_UNEMP),
  limit = query("limit").optional().not().isEmpty().withMessage(LIMIT_UNEMP),
  sort = query("sort").optional().not().isEmpty().withMessage(SORT_UNEMP),
  search = query("search").optional().not().isEmpty().withMessage(SEARCH_UNEMP),
  status = query("status").optional().not().isEmpty().withMessage(STATUS_UNEMP),
  filter = query("status").optional().not().isEmpty().withMessage(FILTER_UNEMP),
  retrieveAllkeywordsValidator = { page, limit, sort, search, status, filter };

export default retrieveAllkeywordsValidator;
