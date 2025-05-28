import { Router } from 'express';
import jwtMiddleware from '../middlewares/jwt.middleware.js';
import responseHelper from '../helpers/response.helper.js';
import * as currencyService from '../services/currency.service.js';

const currencyRouter = Router();
const { verifyToken: jwtAuthGuard } = jwtMiddleware;
const { send200, send400, send401 } = responseHelper;

// Get all active currencies
currencyRouter.get('/list', async (req, res) => {
    try {
        const currencies = await currencyService.getAllCurrencies();
        send200(res, {
            status: true,
            message: 'Currencies fetched successfully',
            data: currencies
        });
    } catch (error) {
        send400(res, {
            status: false,
            message: error.message,
            data: null
        });
    }
});

// Add new currency (Admin only)
currencyRouter.post('/add', jwtAuthGuard, async (req, res) => {
    try {
        const currency = await currencyService.addCurrency(req.body);
        send200(res, {
            status: true,
            message: 'Currency added successfully',
            data: currency
        });
    } catch (error) {
        send400(res, {
            status: false,
            message: error.message,
            data: null
        });
    }
});

// Update currency (Admin only)
currencyRouter.put('/update/:code', jwtAuthGuard, async (req, res) => {
    try {
        const currency = await currencyService.updateCurrency(req.params.code, req.body);
        send200(res, {
            status: true,
            message: 'Currency updated successfully',
            data: currency
        });
    } catch (error) {
        send400(res, {
            status: false,
            message: error.message,
            data: null
        });
    }
});

// Delete currency (Admin only)
currencyRouter.delete('/delete/:code', jwtAuthGuard, async (req, res) => {
    try {
        const result = await currencyService.deleteCurrency(req.params.code);
        send200(res, {
            status: true,
            message: result.message,
            data: null
        });
    } catch (error) {
        send400(res, {
            status: false,
            message: error.message,
            data: null
        });
    }
});

// Get default currency
currencyRouter.get('/default', async (req, res) => {
    try {
        const currency = await currencyService.getDefaultCurrency();
        send200(res, {
            status: true,
            message: 'Default currency fetched successfully',
            data: currency
        });
    } catch (error) {
        send400(res, {
            status: false,
            message: error.message,
            data: null
        });
    }
});

// Set default currency (Admin only)
currencyRouter.post('/set-default/:code', jwtAuthGuard, async (req, res) => {
    try {
        const currency = await currencyService.setDefaultCurrency(req.params.code);
        send200(res, {
            status: true,
            message: 'Default currency updated successfully',
            data: currency
        });
    } catch (error) {
        send400(res, {
            status: false,
            message: error.message,
            data: null
        });
    }
});

export default currencyRouter; 