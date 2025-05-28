import currencyModel from '../models/currency.model.js';

export const getAllCurrencies = async (filter = {}) => {
    try {
        const currencies = await currencyModel.find({ ...filter, isActive: true })
            .sort({ isDefault: -1, name: 1 });
        return currencies;
    } catch (error) {
        throw new Error(`Error fetching currencies: ${error.message}`);
    }
};

export const addCurrency = async (currencyData) => {
    try {
        // If this is the first currency or marked as default, set isDefault to true
        if (currencyData.isDefault) {
            await currencyModel.updateMany({}, { isDefault: false });
        }

        const currency = await currencyModel.create(currencyData);
        return currency;
    } catch (error) {
        throw new Error(`Error adding currency: ${error.message}`);
    }
};

export const updateCurrency = async (code, updateData) => {
    try {
        // If setting as default, update other currencies
        if (updateData.isDefault) {
            await currencyModel.updateMany({}, { isDefault: false });
        }

        const currency = await currencyModel.findOneAndUpdate(
            { code: code.toUpperCase() },
            updateData,
            { new: true }
        );

        if (!currency) {
            throw new Error('Currency not found');
        }

        return currency;
    } catch (error) {
        throw new Error(`Error updating currency: ${error.message}`);
    }
};

export const deleteCurrency = async (code) => {
    try {
        const currency = await currencyModel.findOne({ code: code.toUpperCase() });
        
        if (!currency) {
            throw new Error('Currency not found');
        }

        // Don't allow deletion of default currency
        if (currency.isDefault) {
            throw new Error('Cannot delete default currency');
        }

        // Soft delete by setting isActive to false
        currency.isActive = false;
        await currency.save();

        return { message: 'Currency deleted successfully' };
    } catch (error) {
        throw new Error(`Error deleting currency: ${error.message}`);
    }
};

export const getDefaultCurrency = async () => {
    try {
        const defaultCurrency = await currencyModel.findOne({ isDefault: true, isActive: true });
        if (!defaultCurrency) {
            throw new Error('No default currency set');
        }
        return defaultCurrency;
    } catch (error) {
        throw new Error(`Error getting default currency: ${error.message}`);
    }
};

export const setDefaultCurrency = async (code) => {
    try {
        const currency = await currencyModel.findOne({ code: code.toUpperCase(), isActive: true });
        if (!currency) {
            throw new Error('Currency not found');
        }

        // Update all currencies to not be default
        await currencyModel.updateMany({}, { isDefault: false });

        // Set the selected currency as default
        currency.isDefault = true;
        await currency.save();

        return currency;
    } catch (error) {
        throw new Error(`Error setting default currency: ${error.message}`);
    }
}; 