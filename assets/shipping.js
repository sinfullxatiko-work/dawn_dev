if (!customElements.get('shipping-calculator')) {
  customElements.define(
    'shipping-calculator',
    class ShippingCalculator extends HTMLElement {
      constructor() {
        super();

        this.shippingForm = this.querySelector('form');
        this.errorMessage = this.querySelector('.error-message');

        this.onSubmitHandler = this.onSubmitHandler.bind(this);
        this.showDeliveryRates = this.showDeliveryRates.bind(this);
        this.fillForm = this.fillForm.bind(this);
        this.init = this.init.bind(this);
      }
      connectedCallback() {
        if (this.shippingForm)
          this.shippingForm.addEventListener('submit', this.onSubmitHandler);
        this.init();
        this.onCartUpdate = this.onCartUpdate.bind(this);
        this.unsubscribeCart = subscribe(PUB_SUB_EVENTS.cartUpdate, this.onCartUpdate);
      }
      async onCartUpdate(payload) {
        const fp = await this.getCartFingerPrint();
        const state = JSON.parse(localStorage.getItem('shipping_calc') || 'null');

        if (state && state.cartFingerPrint !== fp) {
          this.querySelector('.delivery-rates')?.remove();
          this.errorMessage.textContent = 'Cart was changed, please recalculate estimated shipping rates';
        }
      }
      async init() {
        const state = JSON.parse(localStorage.getItem('shipping_calc') || 'null');
        const fp = await this.getCartFingerPrint();
        if (!state) return;

        if (state.cartFingerPrint == fp) {
          this.fillForm(state.address);
          this.showDeliveryRates(state.rates);
        } else {
          this.errorMessage.textContent = 'Cart was changed, please recalculate estimated shipping rates';
          this.fillForm(state.address);
        }
      }
      async onSubmitHandler(event) {
        event.preventDefault();
        const formData = new FormData(this.shippingForm);
        const address = Array.from(formData.entries())

        const rates = await this.sendFormToCalculate(formData);
        if (rates.length > 0) {
          this.showDeliveryRates(rates);
          await this.saveToLocal(rates, address);
        }
      }
      // fill form inputs with given address
      fillForm(address) {
        address.forEach(([key, value]) => {
          const input = this.querySelector(`[name="${key}"]`);
          if (input)
            input.value = value;
          else
            console.log('input not found');
        })
      }
      async saveToLocal(rates, address) {
        const cartFingerPrint = await this.getCartFingerPrint();

        const state = {
          address: address,
          rates: rates,
          cartFingerPrint: cartFingerPrint
        }
        localStorage.setItem('shipping_calc', JSON.stringify(state));
      }

      async getCartFingerPrint() {
        const cart = await fetch(window.Shopify.routes.root + 'cart.js', {
          headers: { 'Content-Type': 'application/json' }
        }).then(r => r.json());

        return JSON.stringify({
          token: cart.token,
          weight: cart.total_weight,
          items: cart.items.map(i => ({ id: i.variant_id, q: i.quantity }))
        });
      }
      // draw delivery info under form
      showDeliveryRates(rates) {
        if (!this) return;
        if (this.querySelector('.delivery-rates'))
          this.querySelector('.delivery-rates').remove();

        const wrapper = document.createElement('div');
        wrapper.classList.add('delivery-rates');

        rates.forEach(rate => {
          const line = document.createElement('div');
          line.classList.add('delivery-rates__line');

          const type = document.createElement('div');
          type.classList.add('delivery-rates__type');
          type.textContent = rate.name.toString();

          const days = document.createElement('div');
          days.classList.add('delivery-rates__days');

          if (rate.delivery_days && rate.delivery_days.length > 0)
            days.textContent = rate.delivery_days[0].toString();
          else
            days.textContent = '-';

          const price = document.createElement('div');
          price.classList.add('delivery-rates__price');
          price.textContent = rate.price;

          line.appendChild(type);
          line.appendChild(days);
          line.appendChild(price);

          wrapper.appendChild(line);
        })
        this.appendChild(wrapper);
        this.errorMessage.textContent = '';
      }
      // sending request about shipping rates
      async sendFormToCalculate(formData) {
        try {
          const path = window.Shopify.routes.root + "cart/prepare_shipping_rates.json"
          const prepareResponse = await fetch(path, {
            method: "POST",
            body: formData
          })
          if (!prepareResponse.ok) {
            throw new Error('Failed to prepare shipping rates');
          }
          const rates = await this.pollForRates();
          return rates;
        }
        catch (error) {
          console.error('Error calculating shipping:', error);
          throw error;
        }
      }
      // waiting for response
      async pollForRates(maxAttempts = 10, delay = 500) {
        for (let i = 0; i < maxAttempts; i++) {
          try {
            const path = window.Shopify.routes.root + 'cart/async_shipping_rates.json';
            const response = await fetch(path);
            const data = await response.json();

            if (data.shipping_rates && data.shipping_rates.length > 0)
              return data.shipping_rates;

            await new Promise(resolve => setTimeout(resolve, delay));
          }
          catch (error) {
            console.error('Error calculating shipping:', error);
            throw error;
          }
        }
      }
    }
  )
}