import config from "../configurations/app.config.js";
import Stripe from "stripe";
const stripe = Stripe(config.STRIPE_KEY),
  retrievePrice = async () => {
    try {
      let data = await stripe.prices.list({});
      return data;
    } catch (err) {
      return err;
    }
  },
  createPayMethod = async (token) => {
    try {
      let data = await stripe.paymentMethods.create({
        type: "card",
        card: { token },
      });
      return data;
    } catch (err) {
      return err;
    }
  },
  createPaymentIntents = async ({ customer, amount, payment_method }) => {
    try {
      let data = await stripe.paymentIntents.create({
        customer,
        payment_method,
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: "never",
        },
        amount: amount * 100,
        confirm: true,
      });
      return data;
    } catch (err) {
      return err;
    }
  },
  createCustomer = async ({ email, name }) => {
    try {
      let data = await stripe.customers.create({
        email,
        name,
        description: `Customer with email : ${email}`,
      });
      return data;
    } catch (err) {
      return err;
    }
  },
  updateCustomer = async ({ customer, payId }) => {
    try {
      let data = await stripe.customers.update(customer, {
        invoice_settings: { default_payment_method: payId },
      });
      return data;
    } catch (err) {
      return err;
    }
  },
  createSubscription = async ({ customer, price }) => {
    try {
      let data = await stripe.subscriptions.create({
        customer,
        items: [{ price }],
        expand: ["latest_invoice.payment_intent"],
      });
      return data;
    } catch (err) {
      return err;
    }
  },
  retrieveCustomer = async ({ customerId, cardId }) => {
    try {
      let data = await stripe.customers.retrieveSource(
        `${customerId}`,
        `${cardId}`
      );
      return data;
    } catch (err) {
      return err;
    }
  },
  retrievePayMethod = async (id) => {
    try {
      let data = await stripe.paymentMethods.retrieve(id);
      return data;
    } catch (err) {
      return err;
    }
  },
  attachPaymentMethod = async ({ customer, payId }) => {
    try {
      let data = await stripe.paymentMethods.attach(payId, { customer });
      return data;
    } catch (err) {
      return err;
    }
  },
  detachPaymentMethod = async (id) => {
    try {
      let data = await stripe.paymentMethods.detach(id);
      return data;
    } catch (err) {
      return err;
    }
  },
  deleteSubscription = async (subscriptionId) => {
    try {
      let data = await stripe.subscriptions.cancel(subscriptionId);
      return data;
    } catch (err) {
      return err;
    }
  },
  retrieveSubscription = async (id) => {
    try {
      let data = await stripe.subscriptions.retrieve(id);
      return data;
    } catch (err) {
      return err;
    }
  },
  paymentMethods = async (id) => {
    try {
      let data = await stripe.customers.listPaymentMethods(id, {
        type: "card",
      });
      return data;
    } catch (err) {
      return err;
    }
  },
  retrievePI = async (id) => {
    try {
      let data = await stripe.paymentIntents.retrieve(id);
      return data;
    } catch (err) {
      return err;
    }
  },
  retrieveIN = async (id) => {
    try {
      let data = await stripe.invoices.retrieve(id);
      return data;
    } catch (err) {
      return err;
    }
  },
  createPrice = async ({
    unit_amount,
    currency,
    interval,
    interval_count,
    product,
  }) => {
    try {
      let data = await stripe.prices.create({
        unit_amount: unit_amount * 100,
        currency,
        recurring: { interval, interval_count },
        product,
      });
      return data;
    } catch (err) {
      return err;
    }
  },
  updatePrice = async (id) => {
    try {
      const data = await stripe.prices.update(id, { active: false });
      return data;
    } catch (err) {
      return err;
    }
  },
  retrivePrice = async (id) => {
    try {
      const data = await stripe.prices.retrieve(id);
      return data;
    } catch (err) {
      return err;
    }
  },
  createToken = async ({ bank_account }) => {
    try {
      let data = await stripe.tokens.create({ bank_account });
      return data;
    } catch (err) {
      return err;
    }
  },
  retrieveCoupon = async (couponId) => {
    try {
      let data = await stripe.coupons.retrieve(couponId);
      return data;
    } catch (err) {
      return err;
    }
  },
  stripeExternal = {
    retrievePrice,
    createPayMethod,
    createCustomer,
    updateCustomer,
    createSubscription,
    retrieveCustomer,
    retrievePayMethod,
    attachPaymentMethod,
    deleteSubscription,
    retrieveSubscription,
    retrievePI,
    retrieveIN,
    createPrice,
    updatePrice,
    retrivePrice,
    paymentMethods,
    createToken,
    createPaymentIntents,
    detachPaymentMethod,
    retrieveCoupon,
  };
export default stripeExternal;
